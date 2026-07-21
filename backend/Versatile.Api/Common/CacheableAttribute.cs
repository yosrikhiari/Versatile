namespace Versatile.Api.Common;

[AttributeUsage(AttributeTargets.Method)]
public class CacheableAttribute(int durationSeconds = 300) : Attribute
{
    public int DurationSeconds { get; } = durationSeconds;
}
