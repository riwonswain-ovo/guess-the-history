import { NextResponse } from "next/server";
import { getHistory } from "../../../../lib/game-store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await context.params;
    return NextResponse.json(await getHistory(roundId));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "读取历史问答失败" },
      { status: 404 }
    );
  }
}
