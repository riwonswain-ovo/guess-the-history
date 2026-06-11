import { NextResponse } from "next/server";
import { getGameState } from "../../../lib/game-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getGameState());
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "读取游戏状态失败" },
      { status: 500 }
    );
  }
}
