using System.Reflection;
using OpenAI.Chat;

namespace Versatile.Api.Tests.Infrastructure;

internal static class StreamingChatUpdateFactory
{
    private static readonly ConstructorInfo UpdateCtor = typeof(StreamingChatCompletionUpdate)
        .GetConstructors(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
        .First(c => c.GetParameters().Length == 0);

    private static readonly FieldInfo ContentUpdateField = typeof(StreamingChatCompletionUpdate)
        .GetField("_contentUpdate", BindingFlags.Instance | BindingFlags.NonPublic)!;

    public static StreamingChatCompletionUpdate Create(string text)
    {
        var update = (StreamingChatCompletionUpdate)UpdateCtor.Invoke(null);
        ContentUpdateField.SetValue(update, new ChatMessageContent(text));
        return update;
    }
}
