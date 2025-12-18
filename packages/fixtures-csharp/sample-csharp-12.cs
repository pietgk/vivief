/**
 * Sample C# file for testing modern C# 10-12 features.
 * This file covers:
 * - Nullable reference types
 * - Pattern matching (is, switch expressions)
 * - Init-only setters
 * - Top-level statements (simulated in class)
 * - Primary constructors (C# 12)
 * - Collection expressions (C# 12)
 * - Raw string literals
 * - Required members
 * - File-local types
 * - Lambda improvements
 * - Static abstract members in interfaces
 * - Generic math
 */

using System;
using System.Collections.Generic;
using System.Numerics;

// Type aliases (C# 12) - must be at top of file
using Point = (int X, int Y);
using PersonTuple = (string Name, int Age, string Email);

namespace DevAC.Tests.ModernCSharp;

// ============================================================================
// NULLABLE REFERENCE TYPES
// ============================================================================

/// <summary>
/// Class demonstrating nullable reference types
/// </summary>
public class NullableReferenceDemo
{
    // Non-nullable reference
    public string Name { get; set; } = "";

    // Nullable reference type
    public string? MiddleName { get; set; }

    // Non-nullable with required modifier
    public required string LastName { get; init; }

    // Method with nullable parameter and return
    public string? ProcessName(string? input)
    {
        if (input is null)
            return null;

        return input.ToUpper();
    }

    // Null-forgiving operator usage
    public void ProcessWithAssert()
    {
        string? maybeNull = GetPossibleNull();
        string definitelyNotNull = maybeNull!;
    }

    private string? GetPossibleNull() => null;
}

// ============================================================================
// PATTERN MATCHING
// ============================================================================

/// <summary>
/// Class demonstrating various pattern matching features
/// </summary>
public class PatternMatchingDemo
{
    // Type patterns
    public string DescribeObject(object obj) => obj switch
    {
        null => "null",
        string s => $"String of length {s.Length}",
        int n when n < 0 => "Negative number",
        int n => $"Positive number: {n}",
        IEnumerable<int> list => $"List with items",
        _ => "Unknown type"
    };

    // Property patterns
    public decimal CalculateDiscount(Customer customer) => customer switch
    {
        { Level: CustomerLevel.Gold, YearsActive: > 5 } => 0.20m,
        { Level: CustomerLevel.Gold } => 0.15m,
        { Level: CustomerLevel.Silver, YearsActive: > 3 } => 0.10m,
        { Level: CustomerLevel.Silver } => 0.05m,
        { IsNew: true } => 0.02m,
        _ => 0m
    };

    // Positional patterns (with deconstruction)
    public string ClassifyPoint((int X, int Y) point) => point switch
    {
        (0, 0) => "Origin",
        (0, _) => "On Y-axis",
        (_, 0) => "On X-axis",
        (var x, var y) when x == y => "On diagonal",
        (var x, var y) when x == -y => "On anti-diagonal",
        _ => "Somewhere else"
    };

    // Relational patterns
    public string ClassifyTemperature(double temp) => temp switch
    {
        < 0 => "Freezing",
        >= 0 and < 15 => "Cold",
        >= 15 and < 25 => "Comfortable",
        >= 25 and < 35 => "Warm",
        >= 35 => "Hot"
    };

    // List patterns (C# 11)
    public string DescribeList(int[] numbers) => numbers switch
    {
        [] => "Empty",
        [var single] => $"Single: {single}",
        [var first, var second] => $"Pair: {first}, {second}",
        [var first, .., var last] => $"From {first} to {last}",
    };

    // Logical patterns
    public bool IsValidAge(int age) => age is >= 0 and <= 120;

    // Negation pattern
    public bool IsNotNull(object? obj) => obj is not null;

    // Parenthesized patterns
    public bool IsValidRange(int value) => value is (> 0 and < 100) or (> 200 and < 300);
}

public enum CustomerLevel { Bronze, Silver, Gold }

public class Customer
{
    public CustomerLevel Level { get; init; }
    public int YearsActive { get; init; }
    public bool IsNew { get; init; }
}

// ============================================================================
// INIT-ONLY SETTERS
// ============================================================================

/// <summary>
/// Class demonstrating init-only properties
/// </summary>
public class InitOnlyDemo
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    // Init-only with required modifier
    public required string RequiredField { get; init; }
}

// ============================================================================
// PRIMARY CONSTRUCTORS (C# 12)
// ============================================================================

/// <summary>
/// Class with primary constructor
/// </summary>
public class Person(string firstName, string lastName)
{
    public string FirstName { get; } = firstName;
    public string LastName { get; } = lastName;
    public string FullName => $"{firstName} {lastName}";

    public void Greet()
    {
        Console.WriteLine($"Hello, I'm {firstName}!");
    }
}

/// <summary>
/// Struct with primary constructor
/// </summary>
public readonly struct Point3D(double x, double y, double z)
{
    public double X { get; } = x;
    public double Y { get; } = y;
    public double Z { get; } = z;

    public double Magnitude => Math.Sqrt(x * x + y * y + z * z);
}

/// <summary>
/// Record with primary constructor (existing feature, for comparison)
/// </summary>
public record PersonRecord(string FirstName, string LastName);

/// <summary>
/// Class with primary constructor and base class call
/// </summary>
public class Employee(string firstName, string lastName, string department)
    : Person(firstName, lastName)
{
    public string Department { get; } = department;
}

// ============================================================================
// COLLECTION EXPRESSIONS (C# 12)
// ============================================================================

/// <summary>
/// Class demonstrating collection expressions
/// </summary>
public class CollectionExpressionsDemo
{
    // Array initialization
    public int[] Numbers => [1, 2, 3, 4, 5];

    // List initialization
    public List<string> Names => ["Alice", "Bob", "Charlie"];

    // Span initialization
    public ReadOnlySpan<int> GetSpan() => [1, 2, 3];

    // Spread operator
    public int[] CombineArrays(int[] first, int[] second) => [..first, ..second];

    // Empty collection
    public List<int> EmptyList => [];

    // Mixed with spread
    public int[] PrependAndAppend(int[] middle) => [0, ..middle, 100];
}

// ============================================================================
// RAW STRING LITERALS (C# 11)
// ============================================================================

/// <summary>
/// Class demonstrating raw string literals
/// </summary>
public class RawStringLiteralsDemo
{
    // Simple raw string
    public string Simple => """
        This is a raw string literal.
        It can span multiple lines.
        Special characters like " don't need escaping.
        """;

    // Raw string with interpolation
    public string GetJson(string name, int age) => $$"""
        {
            "name": "{{name}}",
            "age": {{age}}
        }
        """;

    // UTF-8 string literal
    public ReadOnlySpan<byte> GetUtf8() => "Hello"u8;
}

// ============================================================================
// REQUIRED MEMBERS (C# 11)
// ============================================================================

/// <summary>
/// Class with required members
/// </summary>
public class RequiredMembersDemo
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }

    // Constructor that satisfies required members
    [System.Diagnostics.CodeAnalysis.SetsRequiredMembers]
    public RequiredMembersDemo(string id, string name)
    {
        Id = id;
        Name = name;
    }

    // Parameterless constructor for object initializer
    public RequiredMembersDemo() { }
}

// ============================================================================
// FILE-LOCAL TYPES (C# 11)
// ============================================================================

// File-local class - only accessible within this file
file class FileLocalHelper
{
    public static int HelperMethod() => 42;
}

// File-local struct
file struct FileLocalData
{
    public int Value { get; init; }
}

// ============================================================================
// STATIC ABSTRACT MEMBERS IN INTERFACES (C# 11)
// ============================================================================

/// <summary>
/// Interface with static abstract members
/// </summary>
public interface IAddable<TSelf> where TSelf : IAddable<TSelf>
{
    static abstract TSelf operator +(TSelf left, TSelf right);
    static abstract TSelf Zero { get; }
}

/// <summary>
/// Interface for parseable types
/// </summary>
public interface IParseable<TSelf> where TSelf : IParseable<TSelf>
{
    static abstract TSelf Parse(string s);
    static abstract bool TryParse(string s, out TSelf result);
}

/// <summary>
/// Implementation of static abstract interface
/// </summary>
public readonly struct Money : IAddable<Money>
{
    public decimal Amount { get; }

    public Money(decimal amount) => Amount = amount;

    public static Money Zero => new(0);

    public static Money operator +(Money left, Money right)
        => new(left.Amount + right.Amount);
}

// ============================================================================
// GENERIC MATH (C# 11)
// ============================================================================

/// <summary>
/// Class demonstrating generic math interfaces
/// </summary>
public class GenericMathDemo
{
    // Generic sum using INumber interface
    public static T Sum<T>(IEnumerable<T> values) where T : INumber<T>
    {
        T result = T.Zero;
        foreach (var value in values)
        {
            result += value;
        }
        return result;
    }

    // Generic average
    public static T Average<T>(IEnumerable<T> values) where T : INumber<T>
    {
        T sum = T.Zero;
        T count = T.Zero;
        foreach (var value in values)
        {
            sum += value;
            count++;
        }
        return sum / count;
    }

    // Generic clamp
    public static T Clamp<T>(T value, T min, T max) where T : INumber<T>
    {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }
}

// ============================================================================
// LAMBDA IMPROVEMENTS
// ============================================================================

/// <summary>
/// Class demonstrating lambda improvements
/// </summary>
public class LambdaImprovementsDemo
{
    // Lambda with explicit return type
    public Func<int, int> SquareFunc = (int x) => x * x;

    // Lambda with attributes
    public Action LogAction = [System.Obsolete] () => Console.WriteLine("Deprecated");

    // Natural type for lambdas
    public void DemoNaturalType()
    {
        var add = (int a, int b) => a + b;
        var greet = (string name) => $"Hello, {name}!";

        // Inferred delegate type
        Delegate d = (int x) => x * 2;
    }

    // Method group to delegate conversion improvements
    public void DemoMethodGroup()
    {
        var numbers = new[] { 1, 2, 3, 4, 5 };
        var doubled = numbers.Select(Double);
    }

    private static int Double(int x) => x * 2;
}

// ============================================================================
// EXTENDED PROPERTY PATTERNS
// ============================================================================

/// <summary>
/// Class demonstrating extended property patterns
/// </summary>
public class ExtendedPropertyPatternsDemo
{
    public string ProcessOrder(Order order) => order switch
    {
        // Extended property pattern (nested property access)
        { Customer.Address.Country: "USA" } => "Domestic order",
        { Customer.Address.Country: "Canada" } => "North American order",
        { Customer.IsPremium: true } => "Premium international order",
        _ => "Standard international order"
    };
}

public class Order
{
    public Customer2 Customer { get; init; } = new();
    public decimal Total { get; init; }
}

public class Customer2
{
    public string Name { get; init; } = "";
    public Address Address { get; init; } = new();
    public bool IsPremium { get; init; }
}

public class Address
{
    public string Street { get; init; } = "";
    public string City { get; init; } = "";
    public string Country { get; init; } = "";
}

// ============================================================================
// ASYNC STREAM AND DISPOSABLE IMPROVEMENTS
// ============================================================================

/// <summary>
/// Class demonstrating async improvements
/// </summary>
public class AsyncImprovementsDemo
{
    // Async enumerable
    public async IAsyncEnumerable<int> GenerateNumbersAsync()
    {
        for (int i = 0; i < 10; i++)
        {
            await Task.Delay(100);
            yield return i;
        }
    }

    // Async disposable
    public async ValueTask ConsumeAsync()
    {
        await using var resource = new AsyncResource();
        await resource.UseAsync();
    }
}

public class AsyncResource : IAsyncDisposable
{
    public async ValueTask UseAsync()
    {
        await Task.Delay(100);
    }

    public async ValueTask DisposeAsync()
    {
        await Task.Delay(50);
    }
}

// ============================================================================
// SPAN AND REF IMPROVEMENTS
// ============================================================================

/// <summary>
/// Ref struct demonstrating span improvements
/// </summary>
public ref struct SpanBasedParser
{
    private readonly ReadOnlySpan<char> _data;
    private int _position;

    public SpanBasedParser(ReadOnlySpan<char> data)
    {
        _data = data;
        _position = 0;
    }

    public bool TryReadInt(out int value)
    {
        // Simplified parsing logic
        var remaining = _data[_position..];
        return int.TryParse(remaining, out value);
    }
}

// Scoped ref usage
public class RefImprovementsDemo
{
    public void ProcessSpan(scoped ReadOnlySpan<int> data)
    {
        foreach (var item in data)
        {
            Console.WriteLine(item);
        }
    }

    // Ref fields in ref structs (C# 11)
    public ref struct RefFieldStruct
    {
        public ref int Value;

        public RefFieldStruct(ref int value)
        {
            Value = ref value;
        }
    }
}

// ============================================================================
// ALIAS ANY TYPE (C# 12)
// ============================================================================

// Note: The 'using' aliases for Point and PersonTuple are at the top of the file
// (C# requires using aliases to appear before namespace/type declarations)

/// <summary>
/// Class using type aliases
/// </summary>
public class TypeAliasDemo
{
    public Point Origin => (0, 0);

    public PersonTuple CreatePerson(string name, int age, string email)
        => (name, age, email);

    public double Distance(Point a, Point b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        return Math.Sqrt(dx * dx + dy * dy);
    }
}

// ============================================================================
// INLINE ARRAYS (C# 12)
// ============================================================================

/// <summary>
/// Inline array struct
/// </summary>
[System.Runtime.CompilerServices.InlineArray(10)]
public struct InlineBuffer
{
    private int _element0;
}

public class InlineArrayDemo
{
    public void UseInlineArray()
    {
        InlineBuffer buffer = new();
        for (int i = 0; i < 10; i++)
        {
            buffer[i] = i * 2;
        }
    }
}
