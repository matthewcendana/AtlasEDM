const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

// Mirrors the backend's own minimum (see kMinQueryLength in ArtistController.cc) so we
// can skip the request entirely instead of firing it and getting a 400 back.
export const MIN_ARTIST_QUERY_LENGTH = 2;

export interface ArtistSuggestion {
  id: number;
  name: string;
}

interface ArtistSearchResponseArtist {
  id: number;
  name: string;
}

interface ArtistSearchResponse {
  artists?: ArtistSearchResponseArtist[];
}

export async function searchArtists(
  query: string,
  signal?: AbortSignal
): Promise<ArtistSuggestion[]> {
  const url = new URL("/artists/search", BACKEND_URL);
  url.searchParams.set("query", query);

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) {
    throw new Error(`Artist search request failed with status ${res.status}`);
  }

  const data: ArtistSearchResponse = await res.json();

  return (data.artists ?? []).map((artist) => ({
    id: artist.id,
    name: artist.name,
  }));
}
