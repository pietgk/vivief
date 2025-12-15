// Type alias
export type UserId = string;

// Interface
export interface UserConfig {
  name: string;
  email: string;
  role: "admin" | "user";
}

// Enum
export enum Status {
  Active = "active",
  Inactive = "inactive",
  Pending = "pending",
}

// Abstract class
export abstract class BaseService {
  protected readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  abstract process(): Promise<void>;
}

// Concrete class extending abstract
export class UserService extends BaseService {
  private users: Map<UserId, UserConfig> = new Map();
  public readonly version = "1.0.0";

  constructor() {
    super("UserService");
  }

  // Async method
  async process(): Promise<void> {
    console.log("Processing users...");
  }

  // Regular method
  getUser(id: UserId): UserConfig | undefined {
    return this.users.get(id);
  }

  // Static method
  static createDefault(): UserService {
    return new UserService();
  }

  // Getter
  get userCount(): number {
    return this.users.size;
  }

  // Method with callback
  forEach(callback: (user: UserConfig, id: UserId) => void): void {
    this.users.forEach(callback);
  }
}

// Arrow function export
export const createUser = (config: UserConfig): UserConfig => {
  return { ...config };
};

// Regular function export
export function validateUser(user: UserConfig): boolean {
  return user.name.length > 0 && user.email.includes("@");
}

// Default export
export default UserService;
