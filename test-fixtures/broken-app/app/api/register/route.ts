import { NextResponse } from "next/server";

// Simulated Prisma client for the fixture
const prisma = {
  user: {
    create: async (_args: { data: Record<string, unknown> }) => ({
      id: "usr_mock_123",
      email: "jane@example.com",
      password_hash: "hash_abc",
      subscription_tier: "free",
    }),
  },
};

export async function POST(req: Request) {
  const { email, password } = await req.json();

  // BUG #1 (SCHEMA_DRIFT - RED WIRE):
  // Prisma schema has subscription_tier (snake_case), but route passes subscriptionTier (camelCase)
  const user = await prisma.user.create({
    data: {
      email,
      password_hash: password,
      subscriptionTier: "free",
    },
  });

  // BUG #2 (FIELD_MISMATCH - RED WIRE):
  // Returns user_id and token, but frontend expects userId and sessionToken
  return NextResponse.json(
    { user_id: user.id, token: "jwt_123" },
    { status: 201 }
  );
}

