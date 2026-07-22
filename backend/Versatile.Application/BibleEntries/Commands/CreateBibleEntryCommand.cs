using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.BibleEntries.Commands;
public record CreateBibleEntryCommand(Guid StoryId, string Title, string Content, string? Category, Guid? OrganizationId, Guid UserId) : IRequest<BibleEntryDto>, IRequiresOrganization;
