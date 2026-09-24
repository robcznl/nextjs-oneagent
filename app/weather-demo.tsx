"use client";

import { FormEvent, useState } from "react";

export function WeatherDemo() {
  const [city, setCity] = useState("Amsterdam");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function fetchWeather(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
      const body: unknown = await response.json();
      setResult(JSON.stringify(body, null, 2));
    } catch (error) {
      setResult(
        JSON.stringify(
          { error: error instanceof Error ? error.message : "Weather request failed." },
          null,
          2,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2>Dynatrace request demo</h2>
      <p>
        This calls the Next.js server, which makes two outbound HTTPS requests to Open-Meteo:
        geocoding and weather forecast.
      </p>
      <form onSubmit={fetchWeather} style={{ display: "flex", gap: "0.5rem" }}>
        <label>
          <span style={{ display: "block", marginBottom: "0.25rem" }}>City</span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            maxLength={100}
            required
            style={{ font: "inherit", padding: "0.5rem" }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{ alignSelf: "end", font: "inherit", padding: "0.5rem 1rem" }}
        >
          {loading ? "Loading..." : "Fetch weather"}
        </button>
      </form>
      {result && (
        <pre
          style={{
            background: "#f4f4f4",
            marginTop: "1rem",
            overflowX: "auto",
            padding: "1rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {result}
        </pre>
      )}
    </section>
  );
}
