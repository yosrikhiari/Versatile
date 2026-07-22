using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Manuscripts.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Manuscripts.Handlers;

public class UpdateManuscriptHandler : IRequestHandler<UpdateManuscriptCommand, ManuscriptDto>
{
    private readonly IRepository<Manuscript> _manuscripts;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateManuscriptHandler(
        IRepository<Manuscript> manuscripts,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _manuscripts = manuscripts;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<ManuscriptDto> Handle(UpdateManuscriptCommand request, CancellationToken ct)
    {
        var manuscript = await _manuscripts.GetByIdAsync(request.Id, ct);
        if (manuscript is null)
            throw new KeyNotFoundException("Manuscript not found");

        var story = await _stories.GetByIdForOrganizationAsync(manuscript.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Manuscript not found");

        if (request.Title is not null) manuscript.Title = request.Title;
        if (request.Content is not null) { manuscript.Content = request.Content; manuscript.WordCount = CountWords(request.Content); }
        if (request.WordCount.HasValue) manuscript.WordCount = request.WordCount.Value;
        manuscript.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(manuscript);
    }

    private static int CountWords(string text) =>
        text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;

    private static ManuscriptDto ToDto(Manuscript m) => new(
        m.Id, m.StoryId, m.Title, m.Content, m.WordCount, m.CreatedAt, m.UpdatedAt
    );
}
