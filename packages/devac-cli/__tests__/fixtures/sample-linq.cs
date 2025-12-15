// Sample C# LINQ for parser testing
// Tests: query syntax, method syntax, custom extensions, expression trees

using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;

namespace DevAC.Tests.Fixtures.Linq
{
    public class Product
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public decimal Price { get; set; }
        public string Category { get; set; }
        public bool InStock { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class Order
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public int Quantity { get; set; }
        public DateTime OrderDate { get; set; }
    }

    /// <summary>
    /// LINQ query demonstrations
    /// </summary>
    public class LinqExamples
    {
        private readonly List<Product> _products;
        private readonly List<Order> _orders;

        public LinqExamples(List<Product> products, List<Order> orders)
        {
            _products = products;
            _orders = orders;
        }

        // Query syntax - basic where
        public IEnumerable<Product> GetExpensiveProducts()
        {
            return from p in _products
                   where p.Price > 100
                   select p;
        }

        // Query syntax - ordering
        public IEnumerable<Product> GetProductsSortedByPrice()
        {
            return from p in _products
                   orderby p.Price descending
                   select p;
        }

        // Query syntax - projection
        public IEnumerable<string> GetProductNames()
        {
            return from p in _products
                   select p.Name;
        }

        // Query syntax - anonymous type projection
        public IEnumerable<object> GetProductSummaries()
        {
            return from p in _products
                   select new { p.Name, p.Price, IsExpensive = p.Price > 100 };
        }

        // Query syntax - grouping
        public IEnumerable<IGrouping<string, Product>> GetProductsByCategory()
        {
            return from p in _products
                   group p by p.Category;
        }

        // Query syntax - join
        public IEnumerable<object> GetOrderDetails()
        {
            return from o in _orders
                   join p in _products on o.ProductId equals p.Id
                   select new { o.OrderDate, p.Name, o.Quantity, Total = p.Price * o.Quantity };
        }

        // Query syntax - let clause
        public IEnumerable<object> GetDiscountedProducts()
        {
            return from p in _products
                   let discountedPrice = p.Price * 0.9m
                   where discountedPrice > 50
                   select new { p.Name, Original = p.Price, Discounted = discountedPrice };
        }

        // Query syntax - multiple from (SelectMany)
        public IEnumerable<object> GetAllOrderedProducts()
        {
            return from p in _products
                   from o in _orders
                   where o.ProductId == p.Id
                   select new { p.Name, o.Quantity };
        }

        // Method syntax - basic filtering
        public IEnumerable<Product> GetInStockProducts()
        {
            return _products.Where(p => p.InStock);
        }

        // Method syntax - chaining
        public IEnumerable<Product> GetTopExpensiveInStock()
        {
            return _products
                .Where(p => p.InStock)
                .OrderByDescending(p => p.Price)
                .Take(5);
        }

        // Method syntax - aggregation
        public decimal GetTotalValue()
        {
            return _products.Sum(p => p.Price);
        }

        public decimal GetAveragePrice()
        {
            return _products.Average(p => p.Price);
        }

        public Product GetMostExpensive()
        {
            return _products.MaxBy(p => p.Price);
        }

        // Method syntax - grouping with projection
        public Dictionary<string, decimal> GetAveragePriceByCategory()
        {
            return _products
                .GroupBy(p => p.Category)
                .ToDictionary(
                    g => g.Key,
                    g => g.Average(p => p.Price)
                );
        }

        // Method syntax - first/single/last
        public Product GetFirstProduct()
        {
            return _products.FirstOrDefault();
        }

        public Product GetSingleProduct(int id)
        {
            return _products.SingleOrDefault(p => p.Id == id);
        }

        // Method syntax - any/all
        public bool HasExpensiveProducts()
        {
            return _products.Any(p => p.Price > 1000);
        }

        public bool AllInStock()
        {
            return _products.All(p => p.InStock);
        }

        // Method syntax - distinct and set operations
        public IEnumerable<string> GetDistinctCategories()
        {
            return _products.Select(p => p.Category).Distinct();
        }

        // Method syntax - Skip and Take (pagination)
        public IEnumerable<Product> GetPage(int page, int pageSize)
        {
            return _products
                .Skip((page - 1) * pageSize)
                .Take(pageSize);
        }

        // Method syntax - Zip
        public IEnumerable<string> ZipNamesWithPrices()
        {
            var names = _products.Select(p => p.Name);
            var prices = _products.Select(p => p.Price.ToString("C"));
            return names.Zip(prices, (n, p) => $"{n}: {p}");
        }

        // Method syntax - SelectMany
        public IEnumerable<char> GetAllCharacters()
        {
            return _products.SelectMany(p => p.Name.ToCharArray());
        }

        // Deferred execution demonstration
        public IEnumerable<Product> GetFilteredProducts(Func<Product, bool> predicate)
        {
            return _products.Where(predicate);
        }

        // Immediate execution with ToList
        public List<Product> GetProductList()
        {
            return _products.ToList();
        }

        // Immediate execution with ToArray
        public Product[] GetProductArray()
        {
            return _products.ToArray();
        }
    }

    /// <summary>
    /// Custom LINQ extensions
    /// </summary>
    public static class LinqExtensions
    {
        public static IEnumerable<T> WhereNotNull<T>(this IEnumerable<T> source) where T : class
        {
            return source.Where(x => x != null);
        }

        public static IEnumerable<TSource> DistinctBy<TSource, TKey>(
            this IEnumerable<TSource> source,
            Func<TSource, TKey> keySelector)
        {
            var seen = new HashSet<TKey>();
            foreach (var item in source)
            {
                if (seen.Add(keySelector(item)))
                {
                    yield return item;
                }
            }
        }

        public static void ForEach<T>(this IEnumerable<T> source, Action<T> action)
        {
            foreach (var item in source)
            {
                action(item);
            }
        }

        public static IEnumerable<IEnumerable<T>> Batch<T>(this IEnumerable<T> source, int size)
        {
            var batch = new List<T>(size);
            foreach (var item in source)
            {
                batch.Add(item);
                if (batch.Count == size)
                {
                    yield return batch;
                    batch = new List<T>(size);
                }
            }
            if (batch.Count > 0)
            {
                yield return batch;
            }
        }
    }

    /// <summary>
    /// Expression trees for queryable providers
    /// </summary>
    public class ExpressionExamples
    {
        public Expression<Func<Product, bool>> CreatePriceFilter(decimal minPrice)
        {
            return p => p.Price >= minPrice;
        }

        public Expression<Func<Product, bool>> CombineFilters(
            Expression<Func<Product, bool>> filter1,
            Expression<Func<Product, bool>> filter2)
        {
            var parameter = Expression.Parameter(typeof(Product), "p");
            var combined = Expression.AndAlso(
                Expression.Invoke(filter1, parameter),
                Expression.Invoke(filter2, parameter)
            );
            return Expression.Lambda<Func<Product, bool>>(combined, parameter);
        }

        public Func<Product, TResult> CompileSelector<TResult>(Expression<Func<Product, TResult>> selector)
        {
            return selector.Compile();
        }
    }
}
