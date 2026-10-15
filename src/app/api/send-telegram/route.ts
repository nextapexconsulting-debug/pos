import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderText, orderNumber } = body;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in environment variables.",
        },
        { status: 500 }
      );
    }

    if (!orderText) {
      return NextResponse.json(
        { success: false, error: "No order text provided" },
        { status: 400 }
      );
    }

    // Format the message
    const message = orderText;

    // Telegram Bot API - completely free
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("Telegram API error:", data);
      return NextResponse.json(
        {
          success: false,
          error: data.description || "Failed to send Telegram message",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data.result?.message_id,
      orderNumber,
    });
  } catch (error: any) {
    console.error("Send Telegram error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
