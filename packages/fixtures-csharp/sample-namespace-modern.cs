// Sample C# file-scoped namespace (C# 10+) for parser testing
// Tests: file-scoped namespace, top-level statements style, global usings

namespace DevAC.Tests.Fixtures.Modern;

using System;
using System.Collections.Generic;
using System.Threading.Tasks;

/// <summary>
/// Class in file-scoped namespace
/// </summary>
public class ModernService
{
    private readonly ILogger _logger;

    public ModernService(ILogger logger)
    {
        _logger = logger;
    }

    // Expression-bodied members throughout
    public string Name => "ModernService";

    public bool IsEnabled { get; init; } = true;

    public required string Configuration { get; set; }

    // Target-typed new expressions
    private readonly List<string> _items = new();
    private readonly Dictionary<string, object> _cache = new();

    // Pattern matching enhancements
    public string Classify(object obj) => obj switch
    {
        null => "null",
        int i when i < 0 => "negative",
        int i when i > 0 => "positive",
        int => "zero",
        string { Length: 0 } => "empty string",
        string { Length: > 100 } s => $"long string ({s.Length} chars)",
        string s => $"string: {s}",
        IEnumerable<int> nums => $"int collection with {CountItems(nums)} items",
        _ => "unknown"
    };

    private static int CountItems<T>(IEnumerable<T> items)
    {
        int count = 0;
        foreach (var _ in items) count++;
        return count;
    }

    // Property patterns
    public bool IsValidUser(User user) => user is
    {
        IsActive: true,
        Email.Length: > 0,
        Age: >= 18 and <= 120
    };

    // List patterns (C# 11+)
    public string DescribeList(int[] numbers) => numbers switch
    {
        [] => "empty",
        [var single] => $"single: {single}",
        [var first, var second] => $"pair: {first}, {second}",
        [var first, .., var last] => $"from {first} to {last}",
    };

    // Raw string literals (C# 11+)
    public string GetJsonTemplate() => """
        {
            "name": "example",
            "values": [1, 2, 3],
            "nested": {
                "key": "value"
            }
        }
        """;

    // Interpolated raw string (use $$ for literal braces with interpolation)
    public string GetConfigJson(string name, int port) => $$"""
        {
            "service": "{{name}}",
            "port": {{port}},
            "enabled": true
        }
        """;

    // Static abstract members in interfaces (C# 11+)
    public T CreateDefault<T>() where T : IDefaultable<T>
    {
        return T.Default;
    }

    // Generic math (C# 11+)
    public T Sum<T>(IEnumerable<T> values) where T : System.Numerics.INumber<T>
    {
        T result = T.Zero;
        foreach (var value in values)
        {
            result += value;
        }
        return result;
    }
}

/// <summary>
/// Record with primary constructor
/// </summary>
public record UserRecord(string Name, string Email, int Age)
{
    public bool IsAdult => Age >= 18;
}

/// <summary>
/// Class with primary constructor (C# 12+)
/// </summary>
public class Service(ILogger logger, IConfiguration config)
{
    private readonly ILogger _logger = logger;

    public string ConfigValue => config.GetValue("key");

    public void Log(string message) => _logger.Log(message);
}

/// <summary>
/// Struct with primary constructor
/// </summary>
public readonly struct Coordinate(double latitude, double longitude)
{
    public double Latitude { get; } = latitude;
    public double Longitude { get; } = longitude;

    public double DistanceTo(Coordinate other)
    {
        var dLat = other.Latitude - Latitude;
        var dLon = other.Longitude - Longitude;
        return Math.Sqrt(dLat * dLat + dLon * dLon);
    }
}

/// <summary>
/// Interface with static abstract members
/// </summary>
public interface IDefaultable<T> where T : IDefaultable<T>
{
    static abstract T Default { get; }
    static abstract T Create(string value);
}

/// <summary>
/// Implementation of static abstract interface
/// </summary>
public class DefaultableString : IDefaultable<DefaultableString>
{
    public string Value { get; }

    private DefaultableString(string value) => Value = value;

    public static DefaultableString Default => new("");
    public static DefaultableString Create(string value) => new(value);
}

/// <summary>
/// Collection expressions (C# 12+)
/// </summary>
public class CollectionExamples
{
    // Collection expressions
    public int[] GetNumbers() => [1, 2, 3, 4, 5];

    public List<string> GetNames() => ["Alice", "Bob", "Charlie"];

    public Dictionary<string, int> GetScores() => new()
    {
        ["Alice"] = 100,
        ["Bob"] = 85,
        ["Charlie"] = 92
    };

    // Spread operator
    public int[] CombineArrays(int[] first, int[] second) => [..first, ..second];

    public List<int> PrependAndAppend(List<int> middle, int first, int last)
        => [first, ..middle, last];
}

/// <summary>
/// Ref struct and scoped parameters
/// </summary>
public ref struct SpanWrapper
{
    private Span<byte> _data;

    public SpanWrapper(Span<byte> data)
    {
        _data = data;
    }

    public int Length => _data.Length;

    public ref byte this[int index] => ref _data[index];

    public void Fill(byte value)
    {
        _data.Fill(value);
    }
}

// Supporting interfaces
public interface ILogger
{
    void Log(string message);
}

public interface IConfiguration
{
    string GetValue(string key);
}

public class User
{
    public bool IsActive { get; set; }
    public string Email { get; set; }
    public int Age { get; set; }
}
