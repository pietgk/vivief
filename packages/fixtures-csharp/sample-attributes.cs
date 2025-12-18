// Sample C# attributes for parser testing
// Tests: built-in attributes, custom attributes, attribute targets, attribute parameters

using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

[assembly: AssemblyDescription("Sample assembly for testing")]
[module: CLSCompliant(true)]

namespace DevAC.Tests.Fixtures.Attributes
{
    /// <summary>
    /// Custom attribute with no parameters
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public class LoggableAttribute : Attribute
    {
    }

    /// <summary>
    /// Custom attribute with constructor parameters
    /// </summary>
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
    public class CacheAttribute : Attribute
    {
        public int DurationSeconds { get; }
        public string CacheKey { get; set; }

        public CacheAttribute(int durationSeconds)
        {
            DurationSeconds = durationSeconds;
        }
    }

    /// <summary>
    /// Custom attribute with named and optional parameters
    /// </summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field)]
    public class ValidateAttribute : Attribute
    {
        public bool Required { get; set; } = true;
        public int MinLength { get; set; } = 0;
        public int MaxLength { get; set; } = int.MaxValue;
        public string ErrorMessage { get; set; }

        public ValidateAttribute() { }

        public ValidateAttribute(bool required)
        {
            Required = required;
        }
    }

    /// <summary>
    /// Generic attribute (C# 11+)
    /// </summary>
    [AttributeUsage(AttributeTargets.Class)]
    public class TypedAttribute<T> : Attribute where T : class
    {
        public Type TargetType => typeof(T);
    }

    /// <summary>
    /// Class with various attributes
    /// </summary>
    [Serializable]
    [Loggable]
    [Description("User entity for the system")]
    [DebuggerDisplay("{Username} ({Email})")]
    public class User
    {
        [Key]
        [Required]
        public int Id { get; set; }

        [Required]
        [StringLength(50, MinimumLength = 3)]
        [RegularExpression(@"^[a-zA-Z0-9_]+$")]
        public string Username { get; set; }

        [Required]
        [EmailAddress]
        [DataType(DataType.EmailAddress)]
        public string Email { get; set; }

        [Validate(Required = true, MinLength = 8, MaxLength = 100)]
        [DataType(DataType.Password)]
        public string Password { get; set; }

        [Range(0, 150)]
        public int? Age { get; set; }

        [Phone]
        public string PhoneNumber { get; set; }

        [Url]
        public string Website { get; set; }

        [Obsolete("Use FullName instead", error: false)]
        public string Name { get; set; }

        [NotMapped]
        public string FullName => $"{FirstName} {LastName}";

        public string FirstName { get; set; }
        public string LastName { get; set; }

        [DefaultValue(true)]
        public bool IsActive { get; set; } = true;

        // Field with attributes
        [NonSerialized]
        private string _temporaryData;

        // Method with attributes
        [Loggable]
        [Cache(300, CacheKey = "user_data")]
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public string GetDisplayName()
        {
            return FullName ?? Username;
        }

        // Method with conditional attribute
        [Conditional("DEBUG")]
        public void LogDebugInfo()
        {
            Console.WriteLine($"User: {Username}");
        }

        // Method with caller info attributes
        public void Log(
            string message,
            [CallerMemberName] string memberName = "",
            [CallerFilePath] string filePath = "",
            [CallerLineNumber] int lineNumber = 0)
        {
            Console.WriteLine($"[{memberName}:{lineNumber}] {message}");
        }
    }

    /// <summary>
    /// Interface with attributes
    /// </summary>
    [ComVisible(true)]
    [Guid("12345678-1234-1234-1234-123456789abc")]
    public interface IUserService
    {
        [return: NotNull]
        User GetById(int id);

        void Save([NotNull] User user);
    }

    /// <summary>
    /// Enum with attributes
    /// </summary>
    [Flags]
    public enum UserPermissions
    {
        [Description("No permissions")]
        None = 0,

        [Description("Can read data")]
        Read = 1,

        [Description("Can write data")]
        Write = 2,

        [Description("Can delete data")]
        Delete = 4,

        [Description("Full access")]
        Admin = Read | Write | Delete
    }

    /// <summary>
    /// Struct with attributes
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct Point2D
    {
        [MarshalAs(UnmanagedType.R4)]
        public float X;

        [MarshalAs(UnmanagedType.R4)]
        public float Y;
    }

    /// <summary>
    /// Parameter attributes
    /// </summary>
    public class ParameterAttributeExamples
    {
        public void ProcessData(
            [Required] string input,
            [Range(1, 100)] int count,
            [Optional] string options = null)
        {
            // Method implementation
        }

        public void InteropMethod(
            [In] ref int input,
            [Out] out int output,
            [In, Out] ref int inOut)
        {
            output = input * 2;
            inOut += 10;
        }
    }

    /// <summary>
    /// Return value attributes
    /// </summary>
    public class ReturnAttributeExamples
    {
        [return: MarshalAs(UnmanagedType.Bool)]
        public bool CheckCondition() => true;

        [return: NotNullIfNotNull("input")]
        public string Transform(string input)
        {
            return input?.ToUpper();
        }
    }

    /// <summary>
    /// Event and delegate attributes
    /// </summary>
    public class EventAttributeExamples
    {
        [field: NonSerialized]
        public event EventHandler DataChanged;

        [method: MethodImpl(MethodImplOptions.Synchronized)]
        public void RaiseEvent()
        {
            DataChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    // Marker attributes for documentation
    public class NotNullAttribute : Attribute { }
    public class NotNullIfNotNullAttribute : Attribute
    {
        public string ParameterName { get; }
        public NotNullIfNotNullAttribute(string parameterName) => ParameterName = parameterName;
    }
    public class NotMappedAttribute : Attribute { }
    public class OptionalAttribute : Attribute { }
}
