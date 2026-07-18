using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IFlowService
{
    Task<FlowDto> GetAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<FlowDto> UpsertAsync(Guid storyId, UpdateFlowRequest request, Guid userId, Guid? organizationId = null);
}
