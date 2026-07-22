using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Manuscripts.Commands;

public record CreateManuscriptCommand(Guid StoryId, string Title, string? Content, int WordCount, Guid? OrganizationId, Guid UserId) : IRequest<ManuscriptDto>, IRequiresOrganization;
