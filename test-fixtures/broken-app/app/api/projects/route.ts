import { NextResponse } from "next/server";

const prisma = {
  project: {
    findMany: async () => [
      { id: "proj_1", name: "Demo Project", owner_id: "usr_1" },
    ],
    create: async (_args: { data: Record<string, unknown> }) => ({
      id: "proj_2",
      name: "New Project",
      owner_id: "usr_1",
    }),
  },
};

// Healthy GET Endpoint (VERIFIED - Green Wire)
export async function GET() {
  const projects = await prisma.project.findMany();
  return NextResponse.json({ projects }, { status: 200 });
}

// BUG #4 (SWALLOWED_ERROR - YELLOW WIRE):
// Catch block returns HTTP 200 OK with an error payload
export async function POST(req: Request) {
  try {
    const { name, ownerId } = await req.json();
    const project = await prisma.project.create({
      data: { name, owner_id: ownerId },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("Failed to create project:", err);
    // Swallowed error: 200 OK on failure
    return NextResponse.json({ error: "Failed" }, { status: 200 });
  }
}

