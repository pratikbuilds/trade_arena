pub const GAME_SEED: &[u8] = b"game";
pub const PLAYER_SEED: &[u8] = b"player";
pub const VAULT_SEED: &[u8] = b"vault";

/// Pyth push oracle: discriminator at offset 0
pub const PYTH_MAGIC: u32 = 0xa1b2c3d4;
/// Pyth PriceStatus::Trading value (u32 at offset 224 in PriceAccount)
pub const PYTH_STATUS_TRADING: u32 = 1;

/// Grace window (seconds) after game ends for players to commit their ER state
pub const COMMIT_WINDOW: i64 = 120;
