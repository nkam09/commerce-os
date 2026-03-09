import { NextRequest } from "next/server";

const HARDCODED_USER_ID = process.env.COMMERCE_OS_USER_ID ?? "REPLACE_WITH_YOUR_USER_ID";

export async function getUserFromRequest(_req: NextRequest) {
  return { id: HARDCODED_USER_ID };
}