import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { schemaStatements } from "./schema";
import { SiloRepository } from "./repository";

export interface DbOptions {
  filePath: string;
}

export function createSiloDb(options: DbOptions): SiloRepository {
  mkdirSync(dirname(options.filePath), { recursive: true });
  const db = new Database(options.filePath);
  for (const statement of schemaStatements) {
    db.exec(statement);
  }
  return new SiloRepository(db);
}

export * from "./schema";
export * from "./repository";
