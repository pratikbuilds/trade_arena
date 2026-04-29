export type AgentProfile = {
  id: string;
  name: string;
  handle: string;
  thesis: string;
  color: string;
  player: string;
  session?: string;
  order: number;
};

const profilesByGameAndPlayer = new Map<string, AgentProfile>();

function profileKey(gamePubkey: string, player: string): string {
  return `${gamePubkey}:${player}`;
}

export function recordAgentProfile(args: {
  gamePubkey: string;
  player: string;
  profile: Omit<AgentProfile, "player">;
}): AgentProfile {
  const profile = {
    ...args.profile,
    player: args.player,
  };
  profilesByGameAndPlayer.set(
    profileKey(args.gamePubkey, args.player),
    profile
  );
  return profile;
}

export function getAgentProfile(
  gamePubkey: string,
  player: string
): AgentProfile | null {
  return profilesByGameAndPlayer.get(profileKey(gamePubkey, player)) ?? null;
}
