import { NextRequest, NextResponse } from "next/server";

type GeocodingResult = {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
};

function isGeocodingResult(value: unknown): value is GeocodingResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;
  return (
    typeof result.name === "string" &&
    (result.country === undefined || typeof result.country === "string") &&
    typeof result.latitude === "number" &&
    typeof result.longitude === "number"
  );
}

function getFirstLocation(value: unknown): GeocodingResult | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const results = (value as Record<string, unknown>).results;
  return Array.isArray(results) ? results.find(isGeocodingResult) : undefined;
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim() || "Amsterdam";

  if (city.length > 100) {
    return NextResponse.json({ error: "City must be 100 characters or fewer." }, { status: 400 });
  }

  const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodingUrl.searchParams.set("name", city);
  geocodingUrl.searchParams.set("count", "1");
  geocodingUrl.searchParams.set("language", "en");
  geocodingUrl.searchParams.set("format", "json");

  const geocodingResponse = await fetch(geocodingUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!geocodingResponse.ok) {
    return NextResponse.json(
      { error: "Open-Meteo geocoding request failed.", upstreamStatus: geocodingResponse.status },
      { status: 502 },
    );
  }

  const location = getFirstLocation(await geocodingResponse.json());
  if (!location) {
    return NextResponse.json({ error: `No location found for "${city}".` }, { status: 404 });
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(location.latitude));
  forecastUrl.searchParams.set("longitude", String(location.longitude));
  forecastUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
  );
  forecastUrl.searchParams.set("timezone", "auto");

  const forecastResponse = await fetch(forecastUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!forecastResponse.ok) {
    return NextResponse.json(
      { error: "Open-Meteo forecast request failed.", upstreamStatus: forecastResponse.status },
      { status: 502 },
    );
  }

  return NextResponse.json({
    location: {
      name: location.name,
      country: location.country ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
    },
    forecast: await forecastResponse.json(),
    source: "Open-Meteo",
    fetchedAt: new Date().toISOString(),
  });
}
