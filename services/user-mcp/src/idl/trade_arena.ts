/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trade_arena.json`.
 */
export type TradeArena = {
  address: "ETZ1wJJihV6xfcf9GtCp9sNp2cv6cMGeyuFPSVHQJ4C5";
  metadata: {
    name: "tradeArena";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Trading competition on MagicBlock ephemeral rollups";
  };
  instructions: [
    {
      name: "claimPrize";
      discriminator: [157, 233, 139, 121, 246, 62, 234, 235];
      accounts: [
        {
          name: "winner";
          writable: true;
          signer: true;
        },
        {
          name: "game";
          writable: true;
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
              {
                kind: "account";
                path: "game";
              }
            ];
          };
        },
        {
          name: "winnerUsdc";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        }
      ];
      args: [];
    },
    {
      name: "commitGame";
      docs: [
        "Push the final game result from ER to base layer.",
        "Send to: **Ephemeral Rollup endpoint**."
      ];
      discriminator: [212, 148, 56, 92, 60, 28, 179, 66];
      accounts: [
        {
          name: "payer";
          docs: ["Fee payer — anyone can trigger the commit."];
          writable: true;
          signer: true;
        },
        {
          name: "game";
          writable: true;
        },
        {
          name: "magicProgram";
          address: "Magic11111111111111111111111111111111111111";
        },
        {
          name: "magicContext";
          writable: true;
          address: "MagicContext1111111111111111111111111111111";
        }
      ];
      args: [];
    },
    {
      name: "commitPlayer";
      docs: [
        "Commit individual player ER state back to base (optional cleanup).",
        "Send to: **Ephemeral Rollup endpoint**."
      ];
      discriminator: [240, 196, 120, 93, 216, 101, 42, 253];
      accounts: [
        {
          name: "player";
          writable: true;
          signer: true;
        },
        {
          name: "game";
        },
        {
          name: "playerState";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 108, 97, 121, 101, 114];
              },
              {
                kind: "account";
                path: "game";
              },
              {
                kind: "account";
                path: "player";
              }
            ];
          };
        },
        {
          name: "magicProgram";
          address: "Magic11111111111111111111111111111111111111";
        },
        {
          name: "magicContext";
          writable: true;
          address: "MagicContext1111111111111111111111111111111";
        }
      ];
      args: [];
    },
    {
      name: "createGame";
      discriminator: [124, 69, 75, 66, 184, 220, 72, 206];
      accounts: [
        {
          name: "creator";
          writable: true;
          signer: true;
        },
        {
          name: "game";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101];
              },
              {
                kind: "account";
                path: "creator";
              },
              {
                kind: "arg";
                path: "gameId";
              }
            ];
          };
        },
        {
          name: "usdcMint";
          docs: [
            "The SPL mint players will use for their entry fee (expected: USDC)"
          ];
        },
        {
          name: "vault";
          docs: ["Prize vault — owned by the game PDA, released to the winner"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
              {
                kind: "account";
                path: "game";
              }
            ];
          };
        },
        {
          name: "assetFeed";
          docs: ["Validated at trade-time by parse_pyth_price."];
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "rent";
          address: "SysvarRent111111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "gameId";
          type: "u64";
        },
        {
          name: "entryFee";
          type: "u64";
        },
        {
          name: "duration";
          type: "i64";
        },
        {
          name: "maxPlayers";
          type: "u32";
        }
      ];
    },
    {
      name: "delegateGame";
      docs: [
        "Delegate `Game` account to the ER. Send to **base layer**.",
        "Call after all players have joined and before `start_game`."
      ];
      discriminator: [116, 183, 70, 107, 112, 223, 122, 210];
      accounts: [
        {
          name: "creator";
          docs: [
            "Game creator — must sign to prove authority over the game PDA."
          ];
          writable: true;
          signer: true;
        },
        {
          name: "bufferGame";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 117, 102, 102, 101, 114];
              },
              {
                kind: "account";
                path: "game";
              }
            ];
            program: {
              kind: "const";
              value: [
                199,
                245,
                59,
                90,
                42,
                179,
                200,
                65,
                188,
                75,
                117,
                109,
                27,
                66,
                111,
                12,
                156,
                70,
                223,
                41,
                83,
                115,
                127,
                67,
                253,
                128,
                45,
                219,
                9,
                230,
                68,
                134
              ];
            };
          };
        },
        {
          name: "delegationRecordGame";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [100, 101, 108, 101, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "game";
              }
            ];
            program: {
              kind: "account";
              path: "delegationProgram";
            };
          };
        },
        {
          name: "delegationMetadataGame";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ];
              },
              {
                kind: "account";
                path: "game";
              }
            ];
            program: {
              kind: "account";
              path: "delegationProgram";
            };
          };
        },
        {
          name: "game";
          docs: ["ephemeral-rollups-sdk handles the delegation CPI."];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101];
              },
              {
                kind: "account";
                path: "creator";
              },
              {
                kind: "arg";
                path: "gameId";
              }
            ];
          };
        },
        {
          name: "ownerProgram";
          address: "ETZ1wJJihV6xfcf9GtCp9sNp2cv6cMGeyuFPSVHQJ4C5";
        },
        {
          name: "delegationProgram";
          address: "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "gameId";
          type: "u64";
        }
      ];
    },
    {
      name: "delegatePlayer";
      docs: ["Delegate `PlayerState` to the ER. Send to **base layer**."];
      discriminator: [235, 159, 245, 102, 161, 199, 254, 89];
      accounts: [
        {
          name: "player";
          writable: true;
          signer: true;
        },
        {
          name: "game";
        },
        {
          name: "bufferPlayerState";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 117, 102, 102, 101, 114];
              },
              {
                kind: "account";
                path: "playerState";
              }
            ];
            program: {
              kind: "const";
              value: [
                199,
                245,
                59,
                90,
                42,
                179,
                200,
                65,
                188,
                75,
                117,
                109,
                27,
                66,
                111,
                12,
                156,
                70,
                223,
                41,
                83,
                115,
                127,
                67,
                253,
                128,
                45,
                219,
                9,
                230,
                68,
                134
              ];
            };
          };
        },
        {
          name: "delegationRecordPlayerState";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [100, 101, 108, 101, 103, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "playerState";
              }
            ];
            program: {
              kind: "account";
              path: "delegationProgram";
            };
          };
        },
        {
          name: "delegationMetadataPlayerState";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ];
              },
              {
                kind: "account";
                path: "playerState";
              }
            ];
            program: {
              kind: "account";
              path: "delegationProgram";
            };
          };
        },
        {
          name: "playerState";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 108, 97, 121, 101, 114];
              },
              {
                kind: "account";
                path: "game";
              },
              {
                kind: "account";
                path: "player";
              }
            ];
          };
        },
        {
          name: "ownerProgram";
          address: "ETZ1wJJihV6xfcf9GtCp9sNp2cv6cMGeyuFPSVHQJ4C5";
        },
        {
          name: "delegationProgram";
          address: "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [];
    },
    {
      name: "endGame";
      docs: [
        "Rank all players and record the winner. Send to **Ephemeral Rollup endpoint**.",
        "Pass all `PlayerState` accounts as `remaining_accounts`."
      ];
      discriminator: [224, 135, 245, 99, 67, 175, 121, 252];
      accounts: [
        {
          name: "game";
          writable: true;
        },
        {
          name: "priceFeed";
        }
      ];
      args: [];
    },
    {
      name: "joinGame";
      discriminator: [107, 112, 18, 38, 56, 173, 60, 128];
      accounts: [
        {
          name: "player";
          writable: true;
          signer: true;
        },
        {
          name: "game";
          writable: true;
        },
        {
          name: "playerState";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 108, 97, 121, 101, 114];
              },
              {
                kind: "account";
                path: "game";
              },
              {
                kind: "account";
                path: "player";
              }
            ];
          };
        },
        {
          name: "playerUsdc";
          writable: true;
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
              {
                kind: "account";
                path: "game";
              }
            ];
          };
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [];
    },
    {
      name: "processUndelegation";
      discriminator: [196, 28, 41, 206, 48, 37, 51, 167];
      accounts: [
        {
          name: "baseAccount";
          writable: true;
        },
        {
          name: "buffer";
        },
        {
          name: "payer";
          writable: true;
        },
        {
          name: "systemProgram";
        }
      ];
      args: [
        {
          name: "accountSeeds";
          type: {
            vec: "bytes";
          };
        }
      ];
    },
    {
      name: "startGame";
      docs: ["Set the game live. Send to **Ephemeral Rollup endpoint**."];
      discriminator: [249, 47, 252, 172, 184, 162, 245, 14];
      accounts: [
        {
          name: "creator";
          signer: true;
        },
        {
          name: "game";
          writable: true;
        }
      ];
      args: [];
    },
    {
      name: "tradePosition";
      docs: ["Send to: **Ephemeral Rollup endpoint**."];
      discriminator: [234, 67, 214, 140, 202, 245, 127, 49];
      accounts: [
        {
          name: "game";
        },
        {
          name: "playerState";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 108, 97, 121, 101, 114];
              },
              {
                kind: "account";
                path: "game";
              },
              {
                kind: "account";
                path: "player_state.player";
                account: "playerState";
              }
            ];
          };
        },
        {
          name: "sessionToken";
          optional: true;
        },
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "priceFeed";
        }
      ];
      args: [
        {
          name: "action";
          type: {
            defined: {
              name: "tradeAction";
            };
          };
        }
      ];
    }
  ];
  accounts: [
    {
      name: "game";
      discriminator: [27, 90, 166, 125, 74, 100, 121, 18];
    },
    {
      name: "playerState";
      discriminator: [56, 3, 60, 86, 174, 16, 244, 195];
    },
    {
      name: "sessionToken";
      discriminator: [233, 4, 115, 14, 46, 21, 1, 15];
    }
  ];
  errors: [
    {
      code: 6000;
      name: "invalidDuration";
      msg: "Duration must be 300 (5 min) or 900 (15 min) seconds";
    },
    {
      code: 6001;
      name: "invalidMaxPlayers";
      msg: "Max players must be at least 2";
    },
    {
      code: 6002;
      name: "invalidEntryFee";
      msg: "Entry fee must be greater than zero";
    },
    {
      code: 6003;
      name: "gameNotJoinable";
      msg: "Game is not accepting new players";
    },
    {
      code: 6004;
      name: "gameFull";
      msg: "Game is full";
    },
    {
      code: 6005;
      name: "gameNotActive";
      msg: "Game is not active";
    },
    {
      code: 6006;
      name: "gameAlreadyStarted";
      msg: "Game has already started";
    },
    {
      code: 6007;
      name: "notEnoughPlayers";
      msg: "Not enough players to start (minimum 2)";
    },
    {
      code: 6008;
      name: "gameNotOver";
      msg: "Game duration has not elapsed yet";
    },
    {
      code: 6009;
      name: "commitWindowNotOver";
      msg: "Commit window has not passed — wait for players to undelegate";
    },
    {
      code: 6010;
      name: "gameNotEnded";
      msg: "Game has not ended";
    },
    {
      code: 6011;
      name: "unauthorized";
      msg: "unauthorized";
    },
    {
      code: 6012;
      name: "noOpenPosition";
      msg: "No open position to close";
    },
    {
      code: 6013;
      name: "invalidNotional";
      msg: "Trade notional must be greater than zero";
    },
    {
      code: 6014;
      name: "insufficientVirtualBalance";
      msg: "Insufficient virtual USDC balance";
    },
    {
      code: 6015;
      name: "invalidPriceFeed";
      msg: "Invalid Pyth price feed account";
    },
    {
      code: 6016;
      name: "priceFeedStale";
      msg: "Pyth price feed is stale or in non-trading status";
    },
    {
      code: 6017;
      name: "invalidPrice";
      msg: "Price must be positive";
    },
    {
      code: 6018;
      name: "mathOverflow";
      msg: "Math overflow";
    },
    {
      code: 6019;
      name: "wrongPriceFeed";
      msg: "Price feed does not match this game's asset";
    },
    {
      code: 6020;
      name: "wrongPlayerCount";
      msg: "Number of player accounts must equal game.player_count";
    },
    {
      code: 6021;
      name: "invalidPlayerState";
      msg: "Remaining player state account is invalid for this game";
    },
    {
      code: 6022;
      name: "duplicatePlayerState";
      msg: "Duplicate player state account provided";
    },
    {
      code: 6023;
      name: "noCommittedPlayers";
      msg: "No committed player states found — all players may still be on ER";
    },
    {
      code: 6024;
      name: "notWinner";
      msg: "Not the winner";
    },
    {
      code: 6025;
      name: "noPrize";
      msg: "Prize vault is empty";
    },
    {
      code: 6026;
      name: "gameEnded";
      msg: "Game timer has run out — no new positions allowed";
    },
    {
      code: 6027;
      name: "directionMismatch";
      msg: "Increase action side does not match the current position";
    },
    {
      code: 6028;
      name: "reduceExceedsPosition";
      msg: "Reduce action exceeds the current open position";
    },
    {
      code: 6029;
      name: "tradeQuantityTooSmall";
      msg: "Trade notional rounds down to zero quantity at the current price";
    }
  ];
  types: [
    {
      name: "game";
      type: {
        kind: "struct";
        fields: [
          {
            name: "creator";
            docs: ["Creator's pubkey — also used in the PDA seed"];
            type: "pubkey";
          },
          {
            name: "gameId";
            docs: [
              "Caller-supplied nonce used in PDA seed (lets one wallet host multiple games)"
            ];
            type: "u64";
          },
          {
            name: "assetFeed";
            docs: [
              "Pyth push-oracle price feed for the single tradeable asset"
            ];
            type: "pubkey";
          },
          {
            name: "entryFee";
            docs: ["Real USDC entry fee per player (6 decimals)"];
            type: "u64";
          },
          {
            name: "duration";
            docs: [
              "Game duration in seconds — must be 300 (5 min) or 900 (15 min)"
            ];
            type: "i64";
          },
          {
            name: "startTime";
            docs: ["Unix timestamp set when `start_game` is called"];
            type: "i64";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "gameStatus";
              };
            };
          },
          {
            name: "playerCount";
            type: "u32";
          },
          {
            name: "maxPlayers";
            type: "u32";
          },
          {
            name: "prizePool";
            docs: ["Accumulated real USDC in the prize vault"];
            type: "u64";
          },
          {
            name: "usdcMint";
            docs: ["SPL token mint for the entry fee (expected to be USDC)"];
            type: "pubkey";
          },
          {
            name: "leaderValue";
            docs: [
              "Highest virtual portfolio value seen so far (updated in `end_game`)"
            ];
            type: "u64";
          },
          {
            name: "winner";
            docs: [
              "Set once in `end_game` — only this pubkey can call `claim_prize`"
            ];
            type: {
              option: "pubkey";
            };
          },
          {
            name: "bump";
            type: "u8";
          },
          {
            name: "vaultBump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "gameStatus";
      type: {
        kind: "enum";
        variants: [
          {
            name: "waitingForPlayers";
          },
          {
            name: "active";
          },
          {
            name: "ended";
          }
        ];
      };
    },
    {
      name: "playerState";
      docs: [
        "Per-player ephemeral trading state.",
        "",
        "This account is designed to be **delegated** to the MagicBlock ephemeral",
        "rollup after `join_game`, enabling sub-second `trade_position`",
        "transactions. `commit_player` can still be used for early cleanup, but the",
        "normal `end_game` + `commit_game` flow is expected to settle and undelegate",
        "final player state back to base layer.",
        "",
        "Only one net position is tracked at a time (`position_size > 0`).",
        "Reopening in the same direction scales in; reduce and close actions",
        "shrink or flatten that net position in place."
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "player";
            type: "pubkey";
          },
          {
            name: "game";
            type: "pubkey";
          },
          {
            name: "virtualUsdc";
            docs: [
              "Virtual cash on hand (6 decimals, starts at VIRTUAL_STARTING_BALANCE)"
            ];
            type: "u64";
          },
          {
            name: "positionSize";
            docs: [
              "Units of the game asset currently held (6 decimals). 0 = flat (no position)."
            ];
            type: "u64";
          },
          {
            name: "positionSide";
            docs: ["Only meaningful when `position_size > 0`"];
            type: {
              defined: {
                name: "side";
              };
            };
          },
          {
            name: "entryPrice";
            docs: [
              "Normalized entry price: USD × 1_000_000 (set when position opened)"
            ];
            type: "u64";
          },
          {
            name: "realizedPnl";
            docs: [
              "Cumulative PnL from *closed* positions (signed, USDC 6 decimals)"
            ];
            type: "i64";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "sessionToken";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "targetProgram";
            type: "pubkey";
          },
          {
            name: "sessionSigner";
            type: "pubkey";
          },
          {
            name: "validUntil";
            type: "i64";
          }
        ];
      };
    },
    {
      name: "side";
      type: {
        kind: "enum";
        variants: [
          {
            name: "long";
          },
          {
            name: "short";
          }
        ];
      };
    },
    {
      name: "tradeAction";
      type: {
        kind: "enum";
        variants: [
          {
            name: "increase";
            fields: [
              {
                name: "side";
                type: {
                  defined: {
                    name: "side";
                  };
                };
              },
              {
                name: "notionalUsdc";
                type: "u64";
              }
            ];
          },
          {
            name: "reduce";
            fields: [
              {
                name: "notionalUsdc";
                type: "u64";
              }
            ];
          },
          {
            name: "closeAll";
          }
        ];
      };
    }
  ];
};
