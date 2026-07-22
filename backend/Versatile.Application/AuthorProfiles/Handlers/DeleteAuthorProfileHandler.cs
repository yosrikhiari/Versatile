using MediatR;
using Versatile.Application.AuthorProfiles.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.AuthorProfiles.Handlers;
public class DeleteAuthorProfileHandler : IRequestHandler<DeleteAuthorProfileCommand, Unit>
{
    private readonly IRepository<AuthorProfile> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public DeleteAuthorProfileHandler(IRepository<AuthorProfile> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<Unit> Handle(DeleteAuthorProfileCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("AuthorProfile not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("AuthorProfile not found");
        _entities.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
