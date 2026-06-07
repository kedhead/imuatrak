import { Redirect } from "expo-router";

// Legacy route — redirects to the new channel list.
export default function ClubChatRedirect() {
  return <Redirect href={"/club/channels" as never} />;
}
