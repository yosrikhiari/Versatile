using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IPlotThreadService
{
    Task<List<PlotThreadDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<PlotThreadDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<PlotThreadDto> CreateAsync(Guid storyId, CreatePlotThreadRequest request, Guid userId, Guid? organizationId = null);
    Task<PlotThreadDto> UpdateAsync(Guid id, UpdatePlotThreadRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
