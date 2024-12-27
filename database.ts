import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH || "/data/users.sqlite";

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  USER = 'user',
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
    this.db = new Database(DB_PATH, { create: true });
    this.init();
  }

  private init() {
    // Сначала проверяем существование таблицы
    const tableExists = this.db.query(`
      SELECT COUNT(*) as count 
      FROM sqlite_master 
      WHERE type='table' AND name='user_roles'
    `).get() as CountResult;

    if (!tableExists.count) {
      // Если таблицы нет, создаем сразу с нужной структурой
      this.db.run(`
        CREATE TABLE user_roles (
          user_id INTEGER PRIMARY KEY,
          username TEXT,
          role TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CHECK (role IN ('owner', 'admin', 'user'))
        );
      `);
    } else {
      // Если таблица существует, проверяем наличие колонки username
      const hasUsername = this.db.query(`
        SELECT COUNT(*) as count 
        FROM pragma_table_info('user_roles') 
        WHERE name='username'
      `).get() as CountResult;

      if (hasUsername.count === 0) {
        // Если колонки нет, делаем миграцию
        this.db.run(`
          BEGIN TRANSACTION;
          
          -- Создаем временную таблицу
          CREATE TABLE user_roles_new (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            role TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CHECK (role IN ('owner', 'admin', 'user'))
          );
          
          -- Копируем данные
          INSERT INTO user_roles_new (user_id, role, created_at)
          SELECT user_id, role, CURRENT_TIMESTAMP FROM user_roles;
          
          -- Удаляем старую таблицу
          DROP TABLE user_roles;
          
          -- Переименовываем новую таблицу
          ALTER TABLE user_roles_new RENAME TO user_roles;
          
          COMMIT;
        `);
      }
    }

    // New table for settings
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Таблица для статистики использования
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id INTEGER PRIMARY KEY,
        address_checks INTEGER DEFAULT 0,
        last_check_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

  setUserRole(userId: number, role: UserRole, username?: string): void {
    this.db.run(
      "INSERT OR REPLACE INTO user_roles (user_id, username, role) VALUES (?, ?, ?)",
      [userId, username || null, role]
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

  addUser(userId: number, username?: string): void {
    const exists = this.getUserRole(userId);
    if (!exists) {
      this.db.run(
        "INSERT OR IGNORE INTO user_roles (user_id, username, role) VALUES (?, ?, ?)",
        [userId, username || null, UserRole.USER]
      );
    } else {
      // Обновляем username если пользователь уже существует
      this.updateUsername(userId, username);
    }
  }

  updateUsername(userId: number, username?: string): void {
    if (username) {
      this.db.run(
        "UPDATE user_roles SET username = ? WHERE user_id = ?",
        [username, userId]
      );
    }
  }

  getStats(): { 
    totalUsers: number, 
    admins: number, 
    users: number,
    totalChecks: number,
    topUsers: Array<{ userId: number, username: string | null, checks: number }> 
  } {
    const stats = {
      totalUsers: 0,
      admins: 0,
      users: 0,
      totalChecks: 0,
      topUsers: [] as Array<{ userId: number, username: string | null, checks: number }>
    };

    // Получаем общее количество пользователей
    const totalResult = this.db.query(
      "SELECT COUNT(*) as count FROM user_roles"
    ).get() as CountResult;
    stats.totalUsers = totalResult.count;

    // Получаем количество админов (включая owner)
    const adminsResult = this.db.query(
      "SELECT COUNT(*) as count FROM user_roles WHERE role IN (?, ?)"
    ).get(UserRole.ADMIN, UserRole.OWNER) as CountResult;
    stats.admins = adminsResult.count;

    // Получаем количество обычных пользователей
    const usersResult = this.db.query(
      "SELECT COUNT(*) as count FROM user_roles WHERE role = ?"
    ).get(UserRole.USER) as CountResult;
    stats.users = usersResult.count;

    // Получаем общее количество проверок
    const checksResult = this.db.query(
      "SELECT COALESCE(SUM(address_checks), 0) as count FROM user_stats"
    ).get() as CountResult;
    stats.totalChecks = checksResult.count;

    // Получаем топ-5 пользователей по количеству проверок
    stats.topUsers = this.db.query(`
      SELECT s.user_id as userId, r.username, s.address_checks as checks 
      FROM user_stats s
      LEFT JOIN user_roles r ON s.user_id = r.user_id
      ORDER BY s.address_checks DESC 
      LIMIT 5
    `).all() as Array<{ userId: number, username: string | null, checks: number }>;

    return stats;
  }

  // Метод для инкремента счетчика проверок
  incrementAddressChecks(userId: number): void {
    this.db.run(`
      INSERT INTO user_stats (user_id, address_checks, last_check_at)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET 
        address_checks = address_checks + 1,
        last_check_at = CURRENT_TIMESTAMP
    `, [userId]);
  }

  getCommitHash(): string | null {
    return this.getSetting('commit_hash');
  }

  setCommitHash(hash: string) {
    this.setSetting('commit_hash', hash);
  }
}

// Экспортируем синглтон для использования в других модулях
export const userDb = new UserDatabase(); 