// Sample C# generics for parser testing
// Tests: generic classes, methods, constraints, variance

using System;
using System.Collections.Generic;
using System.Linq;

namespace DevAC.Tests.Fixtures.Generics
{
    /// <summary>
    /// Generic class with single type parameter
    /// </summary>
    public class Container<T>
    {
        private T _value;

        public T Value
        {
            get => _value;
            set => _value = value;
        }

        public Container() { }

        public Container(T value)
        {
            _value = value;
        }

        public bool HasValue => _value != null;
    }

    /// <summary>
    /// Generic class with multiple type parameters
    /// </summary>
    public class Pair<TFirst, TSecond>
    {
        public TFirst First { get; set; }
        public TSecond Second { get; set; }

        public Pair(TFirst first, TSecond second)
        {
            First = first;
            Second = second;
        }

        public Pair<TSecond, TFirst> Swap()
        {
            return new Pair<TSecond, TFirst>(Second, First);
        }
    }

    /// <summary>
    /// Generic class with constraints
    /// </summary>
    public class Repository<T> where T : class, new()
    {
        private readonly List<T> _items = new List<T>();

        public void Add(T item)
        {
            _items.Add(item);
        }

        public T CreateNew()
        {
            var item = new T();
            _items.Add(item);
            return item;
        }

        public IEnumerable<T> GetAll() => _items;
    }

    /// <summary>
    /// Generic class with multiple constraints
    /// </summary>
    public class EntityRepository<TEntity, TKey>
        where TEntity : class, IEntity<TKey>
        where TKey : struct, IEquatable<TKey>
    {
        private readonly Dictionary<TKey, TEntity> _entities = new Dictionary<TKey, TEntity>();

        public void Add(TEntity entity)
        {
            _entities[entity.Id] = entity;
        }

        public TEntity GetById(TKey id)
        {
            return _entities.TryGetValue(id, out var entity) ? entity : null;
        }

        public bool Exists(TKey id) => _entities.ContainsKey(id);
    }

    public interface IEntity<TKey> where TKey : struct
    {
        TKey Id { get; }
    }

    /// <summary>
    /// Generic class with inheritance
    /// </summary>
    public class ReadOnlyRepository<T> : Repository<T> where T : class, new()
    {
        public new void Add(T item)
        {
            throw new NotSupportedException("Cannot add to read-only repository");
        }
    }

    /// <summary>
    /// Class with generic methods
    /// </summary>
    public class Utilities
    {
        // Simple generic method
        public T Identity<T>(T value)
        {
            return value;
        }

        // Generic method with constraint
        public T Max<T>(T a, T b) where T : IComparable<T>
        {
            return a.CompareTo(b) > 0 ? a : b;
        }

        // Generic method with multiple type parameters
        public TResult Convert<TInput, TResult>(TInput input, Func<TInput, TResult> converter)
        {
            return converter(input);
        }

        // Generic method with default value
        public T GetValueOrDefault<T>(T value, T defaultValue = default)
        {
            return value != null ? value : defaultValue;
        }

        // Static generic method
        public static List<T> CreateList<T>(params T[] items)
        {
            return new List<T>(items);
        }
    }

    /// <summary>
    /// Covariant generic interface and implementation
    /// </summary>
    public interface IProducer<out T>
    {
        T Produce();
    }

    public class AnimalProducer : IProducer<Animal>
    {
        public Animal Produce() => new Animal { Name = "Generic Animal" };
    }

    public class DogProducer : IProducer<Dog>
    {
        public Dog Produce() => new Dog { Name = "Buddy", Breed = "Labrador" };
    }

    public class Animal
    {
        public string Name { get; set; }
    }

    public class Dog : Animal
    {
        public string Breed { get; set; }
    }

    /// <summary>
    /// Contravariant generic interface
    /// </summary>
    public interface IConsumer<in T>
    {
        void Consume(T item);
    }

    public class AnimalConsumer : IConsumer<Animal>
    {
        public void Consume(Animal animal)
        {
            Console.WriteLine($"Consuming animal: {animal.Name}");
        }
    }

    /// <summary>
    /// Generic delegate
    /// </summary>
    public delegate TResult Transformer<in TInput, out TResult>(TInput input);

    /// <summary>
    /// Generic struct
    /// </summary>
    public struct Optional<T>
    {
        private readonly T _value;
        private readonly bool _hasValue;

        public Optional(T value)
        {
            _value = value;
            _hasValue = true;
        }

        public bool HasValue => _hasValue;
        public T Value => _hasValue ? _value : throw new InvalidOperationException("No value");

        public T GetValueOrDefault(T defaultValue = default)
        {
            return _hasValue ? _value : defaultValue;
        }

        public static Optional<T> None => new Optional<T>();
        public static Optional<T> Some(T value) => new Optional<T>(value);
    }

    /// <summary>
    /// Nested generic class
    /// </summary>
    public class Tree<T>
    {
        public T Value { get; set; }
        public List<Tree<T>> Children { get; } = new List<Tree<T>>();

        public Tree(T value)
        {
            Value = value;
        }

        public class Node
        {
            public T Data { get; set; }
            public Node Parent { get; set; }
        }
    }
}
