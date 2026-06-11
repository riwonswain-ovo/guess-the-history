import { NextResponse } from "next/server";
import { createNextRound } from "../../../../lib/game-store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await createNextRound());
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "创建下一题失败" },
      { status: 500 }
    );
  }
}
