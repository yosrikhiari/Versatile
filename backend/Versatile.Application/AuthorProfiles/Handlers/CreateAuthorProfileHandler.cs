using MediatR;
using Versatile.Application.AuthorProfiles.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.AuthorProfiles.Handlers;
public class CreateAuthorProfileHandler : IRequestHandler<CreateAuthorProfileCommand, AuthorProfileDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<AuthorProfile> _entities;
    private readonly IUnitOfWork _unitOfWork;
    public CreateAuthorProfileHandler(IOrganizationOwnedRepository<Story> stories, IRepository<AuthorProfile> entities, IUnitOfWork unitOfWork)
    { _stories = stories; _entities = entities; _unitOfWork = unitOfWork; }
    public async Task<AuthorProfileDto> Handle(CreateAuthorProfileCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var entity = new AuthorProfile { StoryId = request.StoryId, DisplayName = request.DisplayName, PenName = request.PenName, Bio = request.Bio, Settings = request.Settings, UserId = request.UserId, OrganizationId = request.OrganizationId };
        await _entities.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static AuthorProfileDto ToDto(AuthorProfile e) => new(e.Id, e.StoryId, e.DisplayName, e.PenName, e.Bio, e.Settings, e.CreatedAt, e.UpdatedAt);
}
