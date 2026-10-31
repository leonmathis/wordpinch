import { ImageResponse } from "next/og";
import { LANDSCAPE } from "@/lib/og/match-card";
import { renderCard, roomCard } from "@/lib/og/render";

/**
 * F5: the room link's preview in chats. After the match it shows the
 * result (winner, scores, three words); before, an invite with the code.
 * The same card in 4:5 is /r/[code]/card ("Save image", "Share…").
 */

// Follows the room: an invite before the match, the result after. Image
// routes are cached by default, which would freeze the invite.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> | { code: string } };

export async function generateImageMetadata({ params }: Params) {
  // Next also calls this while serving the image itself, without the
  // route's params there (seen in 16.2.6), so a missing code is normal.
  const code = (await params)?.code;
  const d = code ? await roomCard(code) : null;
  return [
    {
      id: "card",
      alt: d?.alt ?? "wordpinch: two letters, one scribbled word",
      size: LANDSCAPE,
      contentType: "image/png",
    },
  ];
}

export default async function Image({ params }: Params) {
  const { code } = await params;
  const d = await roomCard(code);
  if (!d) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F5F0E3",
            color: "#141414",
            fontSize: 96,
            fontWeight: 800,
          }}
        >
          wordpinch
        </div>
      ),
      LANDSCAPE
    );
  }
  return renderCard(d, "landscape");
}
