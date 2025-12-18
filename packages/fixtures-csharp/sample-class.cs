// Sample C# class for parser testing
// Tests: class declaration, inheritance, access modifiers, constructors, methods, properties, fields

using System;
using System.Collections.Generic;

namespace DevAC.Tests.Fixtures
{
    /// <summary>
    /// Base class for demonstration
    /// </summary>
    public abstract class BaseEntity
    {
        public int Id { get; set; }
        public DateTime CreatedAt { get; protected set; }

        protected BaseEntity()
        {
            CreatedAt = DateTime.UtcNow;
        }

        public abstract void Validate();
    }

    /// <summary>
    /// User class demonstrating inheritance and various member types
    /// </summary>
    public class User : BaseEntity
    {
        // Fields
        private readonly string _passwordHash;
        private static int _instanceCount = 0;
        public const string DefaultRole = "User";

        // Auto-implemented properties
        public string Username { get; set; }
        public string Email { get; private set; }

        // Full property with backing field
        private string _displayName;
        public string DisplayName
        {
            get => _displayName ?? Username;
            set => _displayName = value;
        }

        // Read-only property
        public bool IsActive => !string.IsNullOrEmpty(Email);

        // Static property
        public static int InstanceCount => _instanceCount;

        // Default constructor
        public User() : base()
        {
            _passwordHash = string.Empty;
            _instanceCount++;
        }

        // Parameterized constructor
        public User(string username, string email) : this()
        {
            Username = username;
            Email = email;
        }

        // Static constructor
        static User()
        {
            _instanceCount = 0;
        }

        // Override abstract method
        public override void Validate()
        {
            if (string.IsNullOrEmpty(Username))
            {
                throw new ArgumentException("Username is required");
            }
        }

        // Instance method
        public bool VerifyPassword(string password)
        {
            return HashPassword(password) == _passwordHash;
        }

        // Private method
        private string HashPassword(string password)
        {
            return Convert.ToBase64String(
                System.Text.Encoding.UTF8.GetBytes(password)
            );
        }

        // Static method
        public static User CreateGuest()
        {
            return new User("guest", "guest@example.com");
        }

        // Virtual method
        public virtual string GetGreeting()
        {
            return $"Hello, {DisplayName}!";
        }
    }

    /// <summary>
    /// Sealed class example
    /// </summary>
    public sealed class AdminUser : User
    {
        public List<string> Permissions { get; set; } = new List<string>();

        public AdminUser(string username, string email) : base(username, email)
        {
        }

        public override string GetGreeting()
        {
            return $"Welcome, Admin {DisplayName}!";
        }
    }

    /// <summary>
    /// Static class example
    /// </summary>
    public static class UserExtensions
    {
        public static bool HasPermission(this User user, string permission)
        {
            if (user is AdminUser admin)
            {
                return admin.Permissions.Contains(permission);
            }
            return false;
        }
    }

    /// <summary>
    /// Internal class example
    /// </summary>
    internal class UserRepository
    {
        private readonly List<User> _users = new List<User>();

        public void Add(User user)
        {
            user.Validate();
            _users.Add(user);
        }

        public User FindById(int id)
        {
            return _users.Find(u => u.Id == id);
        }
    }
}
