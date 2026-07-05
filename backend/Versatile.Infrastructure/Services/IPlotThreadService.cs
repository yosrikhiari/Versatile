using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IPlotThreadService
{
    Task<List<PlotThreadDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<PlotThreadDto> GetByIdAsync(Guid id, Guid userId);
    Task<PlotThreadDto> CreateAsync(Guid storyId, CreatePlotThreadRequest request, Guid userId);
    Task<PlotThreadDto> UpdateAsync(Guid id, UpdatePlotThreadRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
