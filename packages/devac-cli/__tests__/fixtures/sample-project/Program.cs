// Sample C# entry point for project testing
// Tests: top-level statements, Main method patterns

using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace DevAC.Tests.SampleProject;

/// <summary>
/// Application entry point
/// </summary>
public class Program
{
    private readonly ILogger<Program> _logger;
    private readonly IServiceProvider _serviceProvider;

    public Program(ILogger<Program> logger, IServiceProvider serviceProvider)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
    }

    /// <summary>
    /// Main entry point
    /// </summary>
    public static async Task<int> Main(string[] args)
    {
        Console.WriteLine("Starting SampleProject...");

        try
        {
            var program = new Program(
                CreateLogger(),
                CreateServiceProvider()
            );

            await program.RunAsync(args);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Fatal error: {ex.Message}");
            return 1;
        }
    }

    /// <summary>
    /// Run the application
    /// </summary>
    public async Task RunAsync(string[] args)
    {
        _logger.LogInformation("Application starting with {ArgCount} arguments", args.Length);

        foreach (var arg in args)
        {
            _logger.LogDebug("Argument: {Arg}", arg);
        }

        await ProcessAsync();

        _logger.LogInformation("Application completed successfully");
    }

    private async Task ProcessAsync()
    {
        await Task.Delay(100);
        _logger.LogInformation("Processing complete");
    }

    private static ILogger<Program> CreateLogger()
    {
        var factory = LoggerFactory.Create(builder =>
        {
            builder.AddConsole();
            builder.SetMinimumLevel(LogLevel.Debug);
        });
        return factory.CreateLogger<Program>();
    }

    private static IServiceProvider CreateServiceProvider()
    {
        // Simplified - would use actual DI container
        return new SimpleServiceProvider();
    }
}

/// <summary>
/// Simple service provider for demonstration
/// </summary>
internal class SimpleServiceProvider : IServiceProvider
{
    public object GetService(Type serviceType)
    {
        // Return null for simplicity - real impl would resolve services
        return null;
    }
}
