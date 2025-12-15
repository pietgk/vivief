// Sample C# async/await for parser testing
// Tests: async methods, Task, ValueTask, cancellation, async streams

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace DevAC.Tests.Fixtures.Async
{
    /// <summary>
    /// Class demonstrating async patterns
    /// </summary>
    public class AsyncService
    {
        private readonly HttpClient _httpClient;

        public AsyncService(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        // Basic async method
        public async Task DoWorkAsync()
        {
            await Task.Delay(100);
            Console.WriteLine("Work completed");
        }

        // Async method with return value
        public async Task<string> GetDataAsync()
        {
            await Task.Delay(50);
            return "Data retrieved";
        }

        // Async method with cancellation token
        public async Task<string> FetchAsync(string url, CancellationToken cancellationToken = default)
        {
            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }

        // ValueTask for potentially synchronous completion
        public ValueTask<int> GetCachedValueAsync(string key)
        {
            // Return synchronously if cached
            if (TryGetFromCache(key, out var value))
            {
                return new ValueTask<int>(value);
            }

            // Otherwise, fetch asynchronously
            return new ValueTask<int>(FetchValueAsync(key));
        }

        private bool TryGetFromCache(string key, out int value)
        {
            value = 0;
            return false;
        }

        private async Task<int> FetchValueAsync(string key)
        {
            await Task.Delay(100);
            return 42;
        }

        // Async method with multiple awaits
        public async Task<ProcessResult> ProcessAsync(string input)
        {
            var validated = await ValidateAsync(input);
            var transformed = await TransformAsync(validated);
            var saved = await SaveAsync(transformed);
            return new ProcessResult(saved, DateTime.UtcNow);
        }

        private Task<string> ValidateAsync(string input) => Task.FromResult(input.Trim());
        private Task<string> TransformAsync(string input) => Task.FromResult(input.ToUpperInvariant());
        private Task<bool> SaveAsync(string data) => Task.FromResult(true);

        // Async method with try-catch
        public async Task<Result<string>> SafeFetchAsync(string url)
        {
            try
            {
                var data = await FetchAsync(url);
                return Result<string>.Success(data);
            }
            catch (HttpRequestException ex)
            {
                return Result<string>.Failure(ex.Message);
            }
        }

        // ConfigureAwait usage
        public async Task LibraryMethodAsync()
        {
            await Task.Delay(100).ConfigureAwait(false);
            // Continue on thread pool thread
        }

        // Async void (event handler pattern - use sparingly)
        public async void OnButtonClick(object sender, EventArgs e)
        {
            await DoWorkAsync();
        }
    }

    /// <summary>
    /// Async streams (C# 8.0+)
    /// </summary>
    public class AsyncStreamService
    {
        // Async enumerable
        public async IAsyncEnumerable<int> GenerateSequenceAsync(
            int count,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            for (int i = 0; i < count; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await Task.Delay(100, cancellationToken);
                yield return i;
            }
        }

        // Consuming async stream
        public async Task ProcessStreamAsync(IAsyncEnumerable<int> stream)
        {
            await foreach (var item in stream)
            {
                Console.WriteLine(item);
            }
        }

        // Async stream with ConfigureAwait
        public async Task ProcessWithConfigureAwaitAsync(IAsyncEnumerable<int> stream)
        {
            await foreach (var item in stream.ConfigureAwait(false))
            {
                Console.WriteLine(item);
            }
        }
    }

    /// <summary>
    /// Parallel async patterns
    /// </summary>
    public class ParallelAsyncService
    {
        // WhenAll pattern
        public async Task<string[]> FetchAllAsync(string[] urls)
        {
            var tasks = new List<Task<string>>();
            foreach (var url in urls)
            {
                tasks.Add(FetchUrlAsync(url));
            }
            return await Task.WhenAll(tasks);
        }

        // WhenAny pattern
        public async Task<string> FetchFirstAsync(string[] urls)
        {
            var tasks = new List<Task<string>>();
            foreach (var url in urls)
            {
                tasks.Add(FetchUrlAsync(url));
            }
            var firstCompleted = await Task.WhenAny(tasks);
            return await firstCompleted;
        }

        private async Task<string> FetchUrlAsync(string url)
        {
            await Task.Delay(100);
            return $"Response from {url}";
        }

        // Parallel.ForEachAsync (C# 10+)
        public async Task ProcessInParallelAsync(IEnumerable<string> items, int maxParallelism = 4)
        {
            var options = new ParallelOptions { MaxDegreeOfParallelism = maxParallelism };
            await Parallel.ForEachAsync(items, options, async (item, ct) =>
            {
                await ProcessItemAsync(item, ct);
            });
        }

        private Task ProcessItemAsync(string item, CancellationToken ct)
        {
            return Task.Delay(50, ct);
        }
    }

    /// <summary>
    /// Async disposal pattern
    /// </summary>
    public class AsyncResource : IAsyncDisposable
    {
        private bool _disposed;

        public async ValueTask DisposeAsync()
        {
            if (!_disposed)
            {
                await CleanupAsync();
                _disposed = true;
            }
        }

        private async Task CleanupAsync()
        {
            await Task.Delay(10);
            Console.WriteLine("Resource cleaned up");
        }
    }

    /// <summary>
    /// Async lazy initialization
    /// </summary>
    public class AsyncLazy<T>
    {
        private readonly Lazy<Task<T>> _lazy;

        public AsyncLazy(Func<Task<T>> factory)
        {
            _lazy = new Lazy<Task<T>>(factory);
        }

        public Task<T> Value => _lazy.Value;

        public bool IsValueCreated => _lazy.IsValueCreated;
    }

    // Helper types
    public record ProcessResult(bool Success, DateTime CompletedAt);

    public class Result<T>
    {
        public bool IsSuccess { get; }
        public T Value { get; }
        public string Error { get; }

        private Result(bool isSuccess, T value, string error)
        {
            IsSuccess = isSuccess;
            Value = value;
            Error = error;
        }

        public static Result<T> Success(T value) => new(true, value, null);
        public static Result<T> Failure(string error) => new(false, default, error);
    }
}
