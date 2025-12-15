// Sample C# records for parser testing (C# 9.0+)
// Tests: record declaration, positional records, record structs, inheritance

using System;
using System.Collections.Generic;

namespace DevAC.Tests.Fixtures.Records
{
    /// <summary>
    /// Basic positional record
    /// </summary>
    public record Person(string FirstName, string LastName);

    /// <summary>
    /// Record with additional members
    /// </summary>
    public record Employee(string FirstName, string LastName, string Department) : Person(FirstName, LastName)
    {
        public int EmployeeId { get; init; }
        public DateTime HireDate { get; init; } = DateTime.UtcNow;

        public string FullName => $"{FirstName} {LastName}";

        public void PrintBadge()
        {
            Console.WriteLine($"[{EmployeeId}] {FullName} - {Department}");
        }
    }

    /// <summary>
    /// Record with explicit constructor
    /// </summary>
    public record Customer
    {
        public string Name { get; init; }
        public string Email { get; init; }
        public CustomerType Type { get; init; }

        public Customer(string name, string email)
        {
            Name = name;
            Email = email;
            Type = CustomerType.Regular;
        }

        public Customer(string name, string email, CustomerType type)
        {
            Name = name;
            Email = email;
            Type = type;
        }
    }

    public enum CustomerType
    {
        Regular,
        Premium,
        Enterprise
    }

    /// <summary>
    /// Record struct (C# 10+)
    /// </summary>
    public readonly record struct Point(double X, double Y)
    {
        public double Distance => Math.Sqrt(X * X + Y * Y);

        public Point Translate(double dx, double dy)
        {
            return new Point(X + dx, Y + dy);
        }
    }

    /// <summary>
    /// Mutable record struct
    /// </summary>
    public record struct MutablePoint(double X, double Y);

    /// <summary>
    /// Record with generic type
    /// </summary>
    public record Result<T>(bool Success, T Value, string Error = null)
    {
        public static Result<T> Ok(T value) => new(true, value);
        public static Result<T> Fail(string error) => new(false, default, error);

        public TResult Match<TResult>(
            Func<T, TResult> onSuccess,
            Func<string, TResult> onFailure)
        {
            return Success ? onSuccess(Value) : onFailure(Error);
        }
    }

    /// <summary>
    /// Sealed record
    /// </summary>
    public sealed record Address(
        string Street,
        string City,
        string State,
        string ZipCode,
        string Country = "USA");

    /// <summary>
    /// Abstract record
    /// </summary>
    public abstract record Shape
    {
        public abstract double Area { get; }
        public abstract double Perimeter { get; }
    }

    /// <summary>
    /// Record inheriting from abstract record
    /// </summary>
    public record Circle(double Radius) : Shape
    {
        public override double Area => Math.PI * Radius * Radius;
        public override double Perimeter => 2 * Math.PI * Radius;
    }

    /// <summary>
    /// Record inheriting from abstract record
    /// </summary>
    public record Rectangle(double Width, double Height) : Shape
    {
        public override double Area => Width * Height;
        public override double Perimeter => 2 * (Width + Height);
    }

    /// <summary>
    /// Record with validation in constructor
    /// </summary>
    public record PositiveNumber
    {
        public double Value { get; }

        public PositiveNumber(double value)
        {
            if (value <= 0)
            {
                throw new ArgumentException("Value must be positive", nameof(value));
            }
            Value = value;
        }
    }

    /// <summary>
    /// Record with deconstructor
    /// </summary>
    public record Range(int Start, int End)
    {
        public int Length => End - Start;

        public void Deconstruct(out int start, out int end, out int length)
        {
            start = Start;
            end = End;
            length = Length;
        }
    }
}
