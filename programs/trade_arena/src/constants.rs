pub const GAME_SEED: &[u8] = b"game";
pub const PLAYER_SEED: &[u8] = b"player";
pub const VAULT_SEED: &[u8] = b"vault";

use anchor_lang::prelude::pubkey;
use anchor_lang::prelude::Pubkey;

pub const PYTH_LAZER_PROGRAM_ID: Pubkey = pubkey!("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");
pub const PYTH_LAZER_FULL_VERIFICATION_LEVEL: u8 = 1;
pub const PYTH_LAZER_MAX_AGE_SECS: i64 = 30;

/// Grace window (seconds) after game ends for players to commit their ER state
pub const COMMIT_WINDOW: i64 = 120;
