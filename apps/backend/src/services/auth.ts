import type { AuthSession, User } from '../models';
import type { BackendStore } from '../store';
import { createId, nowIso } from '../utils';

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  constructor(private readonly store: BackendStore) {}

  register(input: RegisterInput): { user: User; session: AuthSession } {
    const email = input.email.trim().toLowerCase();
    if (!email.includes('@')) {
      throw new Error('A valid email address is required.');
    }
    if (input.password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    if (this.store.usersByEmail.has(email)) {
      throw new Error('A user with this email already exists.');
    }

    const user: User = {
      id: createId('user'),
      email,
      name: input.name.trim() || email,
      createdAt: nowIso(),
    };

    this.store.users.set(user.id, user);
    this.store.usersByEmail.set(email, user.id);
    this.store.passwordHashesByUserId.set(user.id, this.hashPassword(input.password));

    return { user, session: this.createSession(user.id) };
  }

  login(input: LoginInput): { user: User; session: AuthSession } {
    const email = input.email.trim().toLowerCase();
    const userId = this.store.usersByEmail.get(email);
    if (!userId) {
      throw new Error('Invalid email or password.');
    }

    const expectedHash = this.store.passwordHashesByUserId.get(userId);
    if (expectedHash !== this.hashPassword(input.password)) {
      throw new Error('Invalid email or password.');
    }

    const user = this.store.users.get(userId);
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    return { user, session: this.createSession(user.id) };
  }

  authenticate(authorizationHeader?: string): User {
    const token = authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice('Bearer '.length) : undefined;
    if (!token) {
      throw new Error('Authentication is required.');
    }

    const session = this.store.sessions.get(token);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      throw new Error('Authentication is required.');
    }

    const user = this.store.users.get(session.userId);
    if (!user) {
      throw new Error('Authentication is required.');
    }

    return user;
  }

  private createSession(userId: string): AuthSession {
    const session: AuthSession = {
      token: createId('session'),
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    };
    this.store.sessions.set(session.token, session);
    return session;
  }

  private hashPassword(password: string): string {
    let hash = 0;
    for (const char of password) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return `local-dev:${hash.toString(16)}:${password.length}`;
  }
}
