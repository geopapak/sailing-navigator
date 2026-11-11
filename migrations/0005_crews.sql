-- P-022: crews with invitations, crew members (optional athlete card number) and race plans shared read-only.
CREATE TABLE crews (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  boat_id TEXT NOT NULL,
  boat_name TEXT NOT NULL,
  sail_no TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (owner_id, boat_id)
);

CREATE TABLE crew_members (
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'crew' = permanent crew, 'guest' = invited for one race.
  kind TEXT NOT NULL,
  race_id TEXT,
  expires_at INTEGER,
  -- Personal data: seen only by the owner and the member; exported and deleted with the account.
  athlete_card TEXT,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (crew_id, user_id)
);
CREATE INDEX crew_members_user ON crew_members(user_id);

CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  race_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX invites_crew ON invites(crew_id);

CREATE TABLE shared_races (
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  race_id TEXT NOT NULL,
  -- JSON: name, start, course name and marks, owner's note, who sails in which position. No track, no GPS.
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (crew_id, race_id)
);
