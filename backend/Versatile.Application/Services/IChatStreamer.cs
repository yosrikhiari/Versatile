using OpenAI.Chat;

namespace Versatile.Application.Services;

public interface IChatStreamer
{
    IAsyncEnumerable<StreamingChatCompletionUpdate> CompleteChatStreamingAsync(
        IEnumerable<ChatMessage> messages, CancellationToken cancellationToken = default);
}
