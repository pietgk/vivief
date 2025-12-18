// Sample C# partial classes for parser testing
// Tests: partial classes, partial methods, partial structs, partial interfaces

using System;
using System.Collections.Generic;

namespace DevAC.Tests.Fixtures.Partial
{
    /// <summary>
    /// Partial class - Part 1 (typically auto-generated)
    /// </summary>
    public partial class Customer
    {
        // Auto-generated properties
        public int Id { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Email { get; set; }
        public DateTime CreatedAt { get; set; }

        // Partial method declaration (no body)
        partial void OnCreated();
        partial void OnValidating(ref bool isValid);
        partial void OnPropertyChanged(string propertyName);

        // Auto-generated constructor
        public Customer()
        {
            CreatedAt = DateTime.UtcNow;
            OnCreated();
        }
    }

    /// <summary>
    /// Partial class - Part 2 (hand-written extensions)
    /// </summary>
    public partial class Customer
    {
        // Additional properties
        public string FullName => $"{FirstName} {LastName}";
        public bool IsValid { get; private set; }

        // List of orders (business logic)
        private readonly List<Order> _orders = new List<Order>();
        public IReadOnlyList<Order> Orders => _orders.AsReadOnly();

        // Partial method implementation
        partial void OnCreated()
        {
            Console.WriteLine($"Customer created at {CreatedAt}");
        }

        partial void OnValidating(ref bool isValid)
        {
            isValid = !string.IsNullOrEmpty(Email) && Email.Contains("@");
        }

        partial void OnPropertyChanged(string propertyName)
        {
            Console.WriteLine($"Property {propertyName} changed");
        }

        // Business methods
        public void Validate()
        {
            bool valid = true;
            OnValidating(ref valid);
            IsValid = valid;
        }

        public void AddOrder(Order order)
        {
            _orders.Add(order);
            OnPropertyChanged(nameof(Orders));
        }
    }

    /// <summary>
    /// Partial class - Part 3 (additional features)
    /// </summary>
    public partial class Customer : IEquatable<Customer>
    {
        public bool Equals(Customer other)
        {
            if (other == null) return false;
            return Id == other.Id;
        }

        public override bool Equals(object obj)
        {
            return Equals(obj as Customer);
        }

        public override int GetHashCode()
        {
            return Id.GetHashCode();
        }

        public override string ToString()
        {
            return $"Customer {Id}: {FullName}";
        }
    }

    /// <summary>
    /// Partial struct
    /// </summary>
    public partial struct Point3D
    {
        public double X { get; set; }
        public double Y { get; set; }
    }

    public partial struct Point3D
    {
        public double Z { get; set; }

        public double Magnitude => Math.Sqrt(X * X + Y * Y + Z * Z);

        public Point3D(double x, double y, double z)
        {
            X = x;
            Y = y;
            Z = z;
        }
    }

    /// <summary>
    /// Partial interface
    /// </summary>
    public partial interface IRepository<T>
    {
        T GetById(int id);
        IEnumerable<T> GetAll();
    }

    public partial interface IRepository<T>
    {
        void Add(T entity);
        void Update(T entity);
        void Delete(int id);
    }

    /// <summary>
    /// Partial record (C# 9+)
    /// </summary>
    public partial record Person(string FirstName, string LastName);

    public partial record Person
    {
        public string FullName => $"{FirstName} {LastName}";

        public Person WithUpdatedName(string firstName, string lastName)
        {
            return this with { FirstName = firstName, LastName = lastName };
        }
    }

    /// <summary>
    /// Complex partial class with nested types
    /// </summary>
    public partial class OrderProcessor
    {
        private readonly IOrderValidator _validator;

        public OrderProcessor(IOrderValidator validator)
        {
            _validator = validator;
        }

        partial void BeforeProcess(Order order);
        partial void AfterProcess(Order order, ProcessResult result);
    }

    public partial class OrderProcessor
    {
        public ProcessResult Process(Order order)
        {
            BeforeProcess(order);

            if (!_validator.Validate(order))
            {
                return new ProcessResult { Success = false, Error = "Validation failed" };
            }

            var result = new ProcessResult { Success = true, OrderId = order.Id };
            AfterProcess(order, result);
            return result;
        }

        partial void BeforeProcess(Order order)
        {
            Console.WriteLine($"Processing order {order.Id}");
        }

        partial void AfterProcess(Order order, ProcessResult result)
        {
            Console.WriteLine($"Order {order.Id} processed: {result.Success}");
        }

        // Nested partial class
        public partial class OrderBuilder
        {
            private Order _order = new Order();

            public OrderBuilder WithId(int id)
            {
                _order.Id = id;
                return this;
            }
        }

        public partial class OrderBuilder
        {
            public OrderBuilder WithProduct(int productId, int quantity)
            {
                _order.ProductId = productId;
                _order.Quantity = quantity;
                return this;
            }

            public Order Build() => _order;
        }
    }

    // Supporting types
    public class Order
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public int Quantity { get; set; }
    }

    public class ProcessResult
    {
        public bool Success { get; set; }
        public int OrderId { get; set; }
        public string Error { get; set; }
    }

    public interface IOrderValidator
    {
        bool Validate(Order order);
    }
}
