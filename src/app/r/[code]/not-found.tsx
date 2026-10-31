import { NotFoundScreen } from "@/components/game/not-found-screen";

export default function RoomNotFound() {
  return (
    <NotFoundScreen
      title="This room went missing"
      body="That room code doesn't exist or has expired. Start a new game, or try another code."
    />
  );
}
