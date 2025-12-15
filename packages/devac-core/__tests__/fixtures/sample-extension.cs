// Sample C# extension methods for parser testing
// Tests: extension methods, generic extensions, nullable extensions

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace DevAC.Tests.Fixtures.Extensions
{
    /// <summary>
    /// String extension methods
    /// </summary>
    public static class StringExtensions
    {
        // Basic extension method
        public static bool IsNullOrEmpty(this string value)
        {
            return string.IsNullOrEmpty(value);
        }

        public static bool IsNullOrWhiteSpace(this string value)
        {
            return string.IsNullOrWhiteSpace(value);
        }

        // Extension with parameters
        public static string Truncate(this string value, int maxLength, string suffix = "...")
        {
            if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
            {
                return value;
            }
            return value.Substring(0, maxLength - suffix.Length) + suffix;
        }

        // Extension returning different type
        public static int WordCount(this string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return 0;
            }
            return value.Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries).Length;
        }

        // Extension with regex
        public static string ToSlug(this string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return value;
            }

            var slug = value.ToLowerInvariant();
            slug = Regex.Replace(slug, @"[^a-z0-9\s-]", "");
            slug = Regex.Replace(slug, @"\s+", "-");
            slug = Regex.Replace(slug, @"-+", "-");
            return slug.Trim('-');
        }

        // Extension modifying string
        public static string RemoveWhitespace(this string value)
        {
            return string.Concat(value.Where(c => !char.IsWhiteSpace(c)));
        }

        // Extension with out parameter
        public static bool TryParseInt(this string value, out int result)
        {
            return int.TryParse(value, out result);
        }
    }

    /// <summary>
    /// Collection extension methods
    /// </summary>
    public static class CollectionExtensions
    {
        // Generic extension
        public static bool IsEmpty<T>(this IEnumerable<T> source)
        {
            return source == null || !source.Any();
        }

        public static bool IsNotEmpty<T>(this IEnumerable<T> source)
        {
            return source != null && source.Any();
        }

        // Extension with predicate
        public static IEnumerable<T> WhereIf<T>(
            this IEnumerable<T> source,
            bool condition,
            Func<T, bool> predicate)
        {
            return condition ? source.Where(predicate) : source;
        }

        // Extension with index
        public static IEnumerable<(T Item, int Index)> WithIndex<T>(this IEnumerable<T> source)
        {
            return source.Select((item, index) => (item, index));
        }

        // Async extension
        public static async Task<List<T>> ToListAsync<T>(this IAsyncEnumerable<T> source)
        {
            var list = new List<T>();
            await foreach (var item in source)
            {
                list.Add(item);
            }
            return list;
        }

        // Extension with multiple type parameters
        public static Dictionary<TKey, TValue> ToDictionarySafe<TSource, TKey, TValue>(
            this IEnumerable<TSource> source,
            Func<TSource, TKey> keySelector,
            Func<TSource, TValue> valueSelector)
        {
            var dictionary = new Dictionary<TKey, TValue>();
            foreach (var item in source)
            {
                var key = keySelector(item);
                if (!dictionary.ContainsKey(key))
                {
                    dictionary[key] = valueSelector(item);
                }
            }
            return dictionary;
        }

        // Chunking extension
        public static IEnumerable<IEnumerable<T>> Chunk<T>(this IEnumerable<T> source, int size)
        {
            var chunk = new List<T>(size);
            foreach (var item in source)
            {
                chunk.Add(item);
                if (chunk.Count == size)
                {
                    yield return chunk;
                    chunk = new List<T>(size);
                }
            }
            if (chunk.Count > 0)
            {
                yield return chunk;
            }
        }

        // ForEach extension
        public static void ForEach<T>(this IEnumerable<T> source, Action<T> action)
        {
            foreach (var item in source)
            {
                action(item);
            }
        }

        // Async ForEach
        public static async Task ForEachAsync<T>(
            this IEnumerable<T> source,
            Func<T, Task> action)
        {
            foreach (var item in source)
            {
                await action(item);
            }
        }
    }

    /// <summary>
    /// Nullable extension methods
    /// </summary>
    public static class NullableExtensions
    {
        // Value type nullable extensions
        public static T GetValueOrDefault<T>(this T? nullable, T defaultValue) where T : struct
        {
            return nullable ?? defaultValue;
        }

        public static T GetValueOrThrow<T>(this T? nullable, string message = null) where T : struct
        {
            if (!nullable.HasValue)
            {
                throw new InvalidOperationException(message ?? "Value is null");
            }
            return nullable.Value;
        }

        // Reference type nullable extensions
        public static T OrDefault<T>(this T value, T defaultValue) where T : class
        {
            return value ?? defaultValue;
        }

        public static T OrThrow<T>(this T value, string message = null) where T : class
        {
            if (value == null)
            {
                throw new ArgumentNullException(message ?? "Value is null");
            }
            return value;
        }

        // Transform nullable
        public static TResult? Map<T, TResult>(this T? nullable, Func<T, TResult> mapper)
            where T : struct
            where TResult : struct
        {
            return nullable.HasValue ? mapper(nullable.Value) : null;
        }
    }

    /// <summary>
    /// DateTime extension methods
    /// </summary>
    public static class DateTimeExtensions
    {
        public static bool IsWeekend(this DateTime date)
        {
            return date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday;
        }

        public static bool IsWeekday(this DateTime date)
        {
            return !date.IsWeekend();
        }

        public static DateTime StartOfDay(this DateTime date)
        {
            return date.Date;
        }

        public static DateTime EndOfDay(this DateTime date)
        {
            return date.Date.AddDays(1).AddTicks(-1);
        }

        public static DateTime StartOfMonth(this DateTime date)
        {
            return new DateTime(date.Year, date.Month, 1);
        }

        public static DateTime EndOfMonth(this DateTime date)
        {
            return date.StartOfMonth().AddMonths(1).AddTicks(-1);
        }

        public static int Age(this DateTime birthDate)
        {
            var today = DateTime.Today;
            var age = today.Year - birthDate.Year;
            if (birthDate.Date > today.AddYears(-age))
            {
                age--;
            }
            return age;
        }

        public static string ToRelativeTime(this DateTime date)
        {
            var diff = DateTime.Now - date;

            if (diff.TotalSeconds < 60)
                return "just now";
            if (diff.TotalMinutes < 60)
                return $"{(int)diff.TotalMinutes} minutes ago";
            if (diff.TotalHours < 24)
                return $"{(int)diff.TotalHours} hours ago";
            if (diff.TotalDays < 7)
                return $"{(int)diff.TotalDays} days ago";
            if (diff.TotalDays < 30)
                return $"{(int)(diff.TotalDays / 7)} weeks ago";
            if (diff.TotalDays < 365)
                return $"{(int)(diff.TotalDays / 30)} months ago";

            return $"{(int)(diff.TotalDays / 365)} years ago";
        }
    }

    /// <summary>
    /// Task extension methods
    /// </summary>
    public static class TaskExtensions
    {
        public static async Task<T> WithTimeout<T>(this Task<T> task, TimeSpan timeout)
        {
            var delayTask = Task.Delay(timeout);
            var completedTask = await Task.WhenAny(task, delayTask);

            if (completedTask == delayTask)
            {
                throw new TimeoutException();
            }

            return await task;
        }

        public static async Task WithTimeout(this Task task, TimeSpan timeout)
        {
            var delayTask = Task.Delay(timeout);
            var completedTask = await Task.WhenAny(task, delayTask);

            if (completedTask == delayTask)
            {
                throw new TimeoutException();
            }

            await task;
        }

        public static void FireAndForget(this Task task, Action<Exception> onError = null)
        {
            task.ContinueWith(t =>
            {
                if (t.IsFaulted && onError != null)
                {
                    onError(t.Exception?.InnerException ?? t.Exception);
                }
            }, TaskContinuationOptions.OnlyOnFaulted);
        }
    }

    /// <summary>
    /// Object extension methods
    /// </summary>
    public static class ObjectExtensions
    {
        public static bool IsNull(this object obj)
        {
            return obj == null;
        }

        public static bool IsNotNull(this object obj)
        {
            return obj != null;
        }

        public static T As<T>(this object obj) where T : class
        {
            return obj as T;
        }

        public static bool Is<T>(this object obj)
        {
            return obj is T;
        }

        public static T Cast<T>(this object obj)
        {
            return (T)obj;
        }

        public static string ToJson(this object obj)
        {
            // Simplified - would use actual JSON serializer
            return obj?.ToString() ?? "null";
        }
    }
}
