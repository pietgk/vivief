// Sample C# interfaces for parser testing
// Tests: interface declaration, inheritance, default implementations, generic interfaces

using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace DevAC.Tests.Fixtures.Interfaces
{
    /// <summary>
    /// Basic interface example
    /// </summary>
    public interface IEntity
    {
        int Id { get; set; }
        DateTime CreatedAt { get; }
        void Validate();
    }

    /// <summary>
    /// Interface with default implementation (C# 8.0+)
    /// </summary>
    public interface INameable
    {
        string Name { get; set; }

        // Default implementation
        string GetDisplayName()
        {
            return string.IsNullOrEmpty(Name) ? "Unknown" : Name;
        }
    }

    /// <summary>
    /// Interface inheritance
    /// </summary>
    public interface IAuditable : IEntity
    {
        DateTime? UpdatedAt { get; set; }
        string UpdatedBy { get; set; }

        void MarkAsUpdated(string updatedBy)
        {
            UpdatedAt = DateTime.UtcNow;
            UpdatedBy = updatedBy;
        }
    }

    /// <summary>
    /// Generic interface
    /// </summary>
    public interface IRepository<T> where T : IEntity
    {
        T GetById(int id);
        IEnumerable<T> GetAll();
        void Add(T entity);
        void Update(T entity);
        void Delete(int id);
    }

    /// <summary>
    /// Generic interface with multiple type parameters
    /// </summary>
    public interface IMapper<TSource, TDestination>
    {
        TDestination Map(TSource source);
        IEnumerable<TDestination> MapAll(IEnumerable<TSource> sources);
    }

    /// <summary>
    /// Async interface pattern
    /// </summary>
    public interface IAsyncRepository<T> where T : IEntity
    {
        Task<T> GetByIdAsync(int id);
        Task<IEnumerable<T>> GetAllAsync();
        Task AddAsync(T entity);
        Task UpdateAsync(T entity);
        Task DeleteAsync(int id);
        Task<bool> ExistsAsync(int id);
    }

    /// <summary>
    /// Interface with events
    /// </summary>
    public interface INotifiable
    {
        event EventHandler<string> OnNotification;
        void Notify(string message);
    }

    /// <summary>
    /// Interface with indexer
    /// </summary>
    public interface ILookup<TKey, TValue>
    {
        TValue this[TKey key] { get; set; }
        bool ContainsKey(TKey key);
        bool TryGetValue(TKey key, out TValue value);
    }

    /// <summary>
    /// Multiple interface inheritance
    /// </summary>
    public interface IFullEntity : IEntity, INameable, IAuditable
    {
        bool IsDeleted { get; set; }
        void SoftDelete();
    }

    /// <summary>
    /// Covariant generic interface
    /// </summary>
    public interface IReadOnlyRepository<out T> where T : IEntity
    {
        T GetById(int id);
        IEnumerable<T> GetAll();
    }

    /// <summary>
    /// Contravariant generic interface
    /// </summary>
    public interface IComparer<in T>
    {
        int Compare(T x, T y);
    }

    /// <summary>
    /// Internal interface
    /// </summary>
    internal interface IInternalService
    {
        void Execute();
    }
}
