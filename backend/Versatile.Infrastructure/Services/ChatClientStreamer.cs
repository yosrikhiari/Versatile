using OpenAI.Chat;
using Versatile.Application.Services;

namespace Versatile.Infrastructure.Services;

public sealed class ChatClientStreamer(ChatClient client) : IChatStreamer
{
    public IAsyncEnumerable<StreamingChatCompletionUpdate> CompleteChatStreamingAsync(
        IEnumerable<ChatMessage> messages, CancellationToken cancellationToken = default)
        => client.CompleteChatStreamingAsync(messages, cancellationToken: cancellationToken);
}
