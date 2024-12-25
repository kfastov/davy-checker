import { Database } from "bun:sqlite";

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
}

interface CountResult {
  count: number;
}

interface RoleResult {
  role: string;
}

export class UserDatabase {
  private db: Database;

  constructor() {
    this.db = new Database("users.sqlite", { create: true });
    this.init();
  }

  private init() {
    // Создаем таблицу пользователей и их ролей
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER PRIMARY KEY,
        role TEXT NOT NULL,
        CHECK (role IN ('owner', 'admin'))
      );
    `);

    // New table for settings
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Check if owner exists
    const ownerExists = this.db.prepare('SELECT COUNT(*) as count FROM user_roles WHERE role = ?').get(UserRole.OWNER) as CountResult;
    
    if (ownerExists && ownerExists.count === 0) {
      const ownerId = Number(process.env.DEFAULT_OWNER_ID);
      if (isNaN(ownerId)) {
        throw new Error("DEFAULT_OWNER_ID must be set in environment variables");
      }

      // Всегда устанавливаем роль owner для DEFAULT_OWNER_ID
      this.db.run(
        "INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)",
        [ownerId, UserRole.OWNER]
      );
    }
  }

  getUserRole(userId: number): UserRole | null {
    const result = this.db.query(
      "SELECT role FROM user_roles WHERE user_id = ?"
    ).get(userId) as RoleResult | null;

    return result ? (result.role as UserRole) : null;
  }

  setUserRole(userId: number, role: UserRole): void {
    this.db.run(
      "INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)",
      [userId, role]
    );
  }

  removeUserRole(userId: number): void {
    this.db.run("DELETE FROM user_roles WHERE user_id = ?", [userId]);
  }

  isOwner(userId: number): boolean {
    return this.getUserRole(userId) === UserRole.OWNER;
  }

  isAdmin(userId: number): boolean {
    const role = this.getUserRole(userId);
    return role === UserRole.OWNER || role === UserRole.ADMIN;
  }

  setSetting(key: string, value: string): void {
    this.db.run(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      [key, value]
    );
  }

  getSetting(key: string): string | null {
    const result = this.db.query(
      "SELECT value FROM settings WHERE key = ?"
    ).get(key) as { value: string } | null;

    return result ? result.value : null;
  }

  close() {
    this.db.close();
  }
}

// Экспортируем синглтон для использования в других модулях
export const userDb = new UserDatabase(); 