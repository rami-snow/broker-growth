export const expectedHostedProjectRef = "fgqgcikmaccjamwocpat";

export function validatedHostedDatabaseUrl(databaseUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("SUPABASE_HOSTED_DATABASE_URL is not a valid database connection string.");
  }

  const directHostname = `db.${expectedHostedProjectRef}.supabase.co`;
  const decodedUsername = decodeURIComponent(parsedUrl.username);
  const isDirectConnection = parsedUrl.hostname === directHostname;
  const isPoolerConnection = parsedUrl.hostname.endsWith(".pooler.supabase.com")
    && decodedUsername === `postgres.${expectedHostedProjectRef}`;

  if (!isDirectConnection && !isPoolerConnection) {
    throw new Error("The database connection identity does not match the expected hosted project.");
  }

  parsedUrl.searchParams.delete("sslmode");
  return parsedUrl;
}
