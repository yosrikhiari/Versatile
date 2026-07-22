using MediatR;
using Versatile.Application.AuthorProfiles.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.AuthorProfiles.Handlers;
public class UpdateAuthorProfileHandler : IRequestHandler<UpdateAuthorProfileCommand, AuthorProfileDto>
{
    private readonly IRepository<AuthorProfile> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public UpdateAuthorProfileHandler(IRepository<AuthorProfile> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<AuthorProfileDto> Handle(UpdateAuthorProfileCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("AuthorProfile not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("AuthorProfile not found");
        if (request.DisplayName is not null) entity.DisplayName = request.DisplayName;
        if (request.PenName is not null) entity.PenName = request.PenName;
        if (request.Bio is not null) entity.Bio = request.Bio;
        if (request.Settings is not null) entity.Settings = request.Settings;
        entity.UpdatedAt = DateTime.UtcNow;
        _entities.Update(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static AuthorProfileDto ToDto(AuthorProfile e) => new(e.Id, e.StoryId, e.DisplayName, e.PenName, e.Bio, e.Settings, e.CreatedAt, e.UpdatedAt);
}
