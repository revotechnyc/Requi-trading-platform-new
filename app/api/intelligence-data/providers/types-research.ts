/**
 * Shared shapes for Revision 1 paid/mock research providers.
 * Live responses must never invent; mock responses are labeled source MOCK.
 */

export type ResearchSourceKind = "MOCK" | "LIVE";

export type ResearchFetchBase = {
  available: boolean;
  source: string;
  mock: boolean;
  error?: string;
};

export function researchUnavailable(
  source: string,
  error: string,
  mock = false,
): ResearchFetchBase {
  return { available: false, source, mock, error };
}

export function researchOk(source: string, mock: boolean): Pick<ResearchFetchBase, "available" | "source" | "mock"> {
  return { available: true, source: mock ? `MOCK/${source}` : source, mock };
}
