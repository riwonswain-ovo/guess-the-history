import { NextResponse } from "next/server";
import { submitQuestion } from "../../../lib/game-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: string;
      player?: {
        avatar?: string;
        nickname?: string;
      };
    };

    const state = await submitQuestion({
      question: body.question ?? "",
      player: {
        avatar: body.player?.avatar ?? "",
        nickname: body.player?.nickname ?? ""
      }
    });

    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "提交问题失败" },
      { status: 400 }
    );
  }
}
