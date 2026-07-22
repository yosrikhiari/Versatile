using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Manuscripts.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Manuscripts.Handlers;

public class CreateManuscriptHandler : IRequestHandler<CreateManuscriptCommand, ManuscriptDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Manuscript> _manuscripts;
    private readonly IUnitOfWork _unitOfWork;

    public CreateManuscriptHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<Manuscript> manuscripts,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _manuscripts = manuscripts;
        _unitOfWork = unitOfWork;
    }

    public async Task<ManuscriptDto> Handle(CreateManuscriptCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var manuscript = new Manuscript
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Content = request.Content,
            WordCount = request.WordCount > 0 ? request.WordCount : CountWords(request.Content ?? ""),
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _manuscripts.AddAsync(manuscript, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(manuscript);
    }

    private static int CountWords(string text) =>
        text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;

    private static ManuscriptDto ToDto(Manuscript m) => new(
        m.Id, m.StoryId, m.Title, m.Content, m.WordCount, m.CreatedAt, m.UpdatedAt
    );
}
