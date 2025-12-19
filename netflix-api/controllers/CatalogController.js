const asyncHandler = require("express-async-handler");
const axios = require("axios");

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const tmdb = axios.create({
  baseURL: TMDB_BASE_URL,
  timeout: 15000,
});

const GENRES_TTL_MS = 60 * 60 * 1000;
const RESPONSE_TTL_MS = 60 * 1000;
const genresCache = new Map();
const responseCache = new Map();

const getApiKey = () => {
  const key = (process.env.TMDB_API_KEY || process.env.API_KEY || "").trim();
  if (!key) {
    throw new Error("TMDB_API_KEY is not configured");
  }
  return key;
};

const setCache = (map, key, value, ttlMs) => {
  map.set(key, { expiresAt: Date.now() + ttlMs, value });
};

const getCache = (map, key) => {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
};

const tmdbGet = async (url, retries = 1) => {
  try {
    return await tmdb.get(url);
  } catch (err) {
    const status = err?.response?.status;
    if (retries > 0 && (status === 429 || (status >= 500 && status <= 599))) {
      await new Promise((r) => setTimeout(r, 250));
      return tmdbGet(url, retries - 1);
    }
    throw err;
  }
};

const toHttpError = (res, err, fallbackMessage) => {
  const status = err?.response?.status;
  const tmdbMessage =
    err?.response?.data?.status_message || err?.response?.data?.message || err?.message;

  if (status === 401 || status === 403) {
    res.status(502);
    throw new Error("TMDB rejected the request (check TMDB_API_KEY)");
  }
  if (status === 429) {
    res.status(429);
    throw new Error("Too many requests to TMDB. Please try again in a moment.");
  }
  if (status) {
    res.status(502);
    throw new Error(`TMDB error (${status}): ${tmdbMessage}`);
  }

  res.status(502);
  throw new Error(fallbackMessage || "Upstream TMDB request failed");
};

const getGenresById = async (type, apiKey) => {
  const cacheKey = `genres:${type}`;
  const cached = getCache(genresCache, cacheKey);
  if (cached) return cached;

  const genresResponse = await tmdbGet(`/genre/${type}/list?api_key=${apiKey}`);
  const genres = genresResponse.data?.genres ?? [];
  const genresById = new Map(genres.map((g) => [g.id, g.name]));
  setCache(genresCache, cacheKey, genresById, GENRES_TTL_MS);
  return genresById;
};

const discoverItems = async ({ apiKey, type, genre, year, sortBy, page }) => {
  const genreParam = genre ? `&with_genres=${encodeURIComponent(genre)}` : "";
  const sortParam = sortBy ? `&sort_by=${encodeURIComponent(sortBy)}` : "";
  const yearParam = year
    ? type === "tv"
      ? `&first_air_date_year=${encodeURIComponent(year)}`
      : `&primary_release_year=${encodeURIComponent(year)}`
    : "";

  const cacheKey = `discover:${type}:${genre || ""}:${sortBy || ""}:${year || ""}:${page || 1}`;
  const cached = getCache(responseCache, cacheKey);
  if (cached) return cached;

  const genresById = await getGenresById(type, apiKey);
  const url = `/discover/${type}?api_key=${apiKey}${genreParam}${sortParam}${yearParam}&page=${page}`;
  const { data } = await tmdbGet(url);
  const results = data?.results ?? [];

  const items = results
    .filter((r) => r && (r.backdrop_path || r.poster_path))
    .map((r) => toItem(r, type, genresById));

  const payload = { page: data?.page ?? page, totalPages: data?.total_pages ?? 1, items };
  setCache(responseCache, cacheKey, payload, RESPONSE_TTL_MS);
  return payload;
};

const mapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let idx = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }).map(async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await mapper(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
};

const toItem = (raw, type, genresById) => {
  const genreNames = (raw.genre_ids || [])
    .map((id) => genresById.get(id))
    .filter(Boolean)
    .slice(0, 3);

  const date = type === "tv" ? raw.first_air_date : raw.release_date;
  const year = date ? String(date).slice(0, 4) : "";

  return {
    id: raw.id,
    type,
    title: raw.name || raw.title || raw.original_name || raw.original_title || "",
    overview: raw.overview || "",
    year,
    image: raw.backdrop_path || raw.poster_path || null,
    genres: genreNames,
  };
};

module.exports.getGenres = asyncHandler(async (req, res) => {
  const apiKey = getApiKey();
  try {
    const cached = getCache(responseCache, "genres:merged");
    if (cached) return res.json(cached);

    const [movieGenresResponse, tvGenresResponse] = await Promise.all([
      tmdbGet(`/genre/movie/list?api_key=${apiKey}`),
      tmdbGet(`/genre/tv/list?api_key=${apiKey}`),
    ]);

    const movieGenres = movieGenresResponse.data?.genres ?? [];
    const tvGenres = tvGenresResponse.data?.genres ?? [];
    const merged = [...movieGenres, ...tvGenres];
    const deduped = Array.from(new Map(merged.map((g) => [g.id, g])).values());
    const payload = { genres: deduped };
    setCache(responseCache, "genres:merged", payload, GENRES_TTL_MS);
    return res.json(payload);
  } catch (err) {
    return toHttpError(res, err, "Failed to fetch genres");
  }
});

module.exports.discover = asyncHandler(async (req, res) => {
  const apiKey = getApiKey();
  const type = String(req.query.type || "movie");
  if (type !== "movie" && type !== "tv") {
    res.status(400);
    throw new Error("Invalid type");
  }

  const genre = req.query.genre ? String(req.query.genre) : "";
  const year = req.query.year ? String(req.query.year) : "";
  const sortBy = req.query.sortBy ? String(req.query.sortBy) : "popularity.desc";
  const page = req.query.page ? Number(req.query.page) : 1;

  try {
    const payload = await discoverItems({ apiKey, type, genre, year, sortBy, page });
    return res.json(payload);
  } catch (err) {
    return toHttpError(res, err, "Failed to discover items");
  }
});

module.exports.trailer = asyncHandler(async (req, res) => {
  const apiKey = getApiKey();
  const type = String(req.query.type || "movie");
  const id = String(req.query.id || "");

  if (!id) {
    res.status(400);
    throw new Error("Missing id");
  }
  if (type !== "movie" && type !== "tv") {
    res.status(400);
    throw new Error("Invalid type");
  }

  try {
    const cacheKey = `trailer:${type}:${id}`;
    const cached = getCache(responseCache, cacheKey);
    if (cached) return res.json(cached);

    const { data } = await tmdbGet(`/${type}/${id}/videos?api_key=${apiKey}`);
    const results = data?.results ?? [];
  const youtube = results.filter(
    (v) => (v.site || "").toLowerCase() === "youtube" && v.key
  );
  const preferred =
    youtube.find((v) => (v.type || "").toLowerCase() === "trailer") ||
    youtube.find((v) => (v.type || "").toLowerCase() === "teaser") ||
    youtube[0];

    const payload = { youtubeKey: preferred?.key ?? null };
    setCache(responseCache, cacheKey, payload, RESPONSE_TTL_MS);
    return res.json(payload);
  } catch (err) {
    return toHttpError(res, err, "Failed to fetch trailer");
  }
});

module.exports.trending = asyncHandler(async (req, res) => {
  const apiKey = getApiKey();
  const type = String(req.query.type || "movie");
  if (type !== "movie" && type !== "tv") {
    res.status(400);
    throw new Error("Invalid type");
  }

  const page = req.query.page ? Number(req.query.page) : 1;

  try {
    const cacheKey = `trending:${type}:${page}`;
    const cached = getCache(responseCache, cacheKey);
    if (cached) return res.json(cached);

    const genresById = await getGenresById(type, apiKey);
    const { data } = await tmdbGet(`/trending/${type}/week?api_key=${apiKey}&page=${page}`);
    const results = data?.results ?? [];
    const items = results
      .filter((r) => r && (r.backdrop_path || r.poster_path))
      .map((r) => toItem(r, type, genresById));

    const payload = { page: data?.page ?? page, totalPages: data?.total_pages ?? 1, items };
    setCache(responseCache, cacheKey, payload, RESPONSE_TTL_MS);
    return res.json(payload);
  } catch (err) {
    return toHttpError(res, err, "Failed to fetch trending items");
  }
});

module.exports.sections = asyncHandler(async (req, res) => {
  const apiKey = getApiKey();
  const type = String(req.query.type || "movie");
  if (type !== "movie" && type !== "tv") {
    res.status(400);
    throw new Error("Invalid type");
  }

  const genres = String(req.query.genres || "");
  const year = req.query.year ? String(req.query.year) : "";
  const genreIds = genres
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!genreIds.length) {
    res.status(400);
    throw new Error("Missing genres");
  }

  try {
    const cacheKey = `sections:${type}:${genreIds.join(",")}:${year || ""}`;
    const cached = getCache(responseCache, cacheKey);
    if (cached) return res.json(cached);

    const results = await mapLimit(genreIds, 4, async (gid) => {
      const payload = await discoverItems({
        apiKey,
        type,
        genre: gid,
        year,
        sortBy: "popularity.desc",
        page: 1,
      });
      return [gid, payload.items];
    });

    const sections = {};
    results.forEach(([gid, items]) => {
      sections[String(gid)] = items;
    });

    const payload = { type, sections };
    setCache(responseCache, cacheKey, payload, RESPONSE_TTL_MS);
    return res.json(payload);
  } catch (err) {
    return toHttpError(res, err, "Failed to fetch sections");
  }
});
