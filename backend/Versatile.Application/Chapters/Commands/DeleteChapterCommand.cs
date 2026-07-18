using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Commands;

public record DeleteChapterCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
